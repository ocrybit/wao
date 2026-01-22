--[[
  Social Feed App
  A decentralized social network with posts, follows, likes, and comments.

  Vibe Prompt: "Build a Twitter-like social feed where users can post,
  follow others, like and comment on posts. Show me my feed from
  people I follow, and let me see trending posts."

  Actions:
  - Post: Create a new post
  - Like: Like a post
  - Unlike: Remove like
  - Comment: Comment on a post
  - Follow: Follow a user
  - Unfollow: Unfollow a user
  - Feed: Get feed from followed users
  - Profile: Get user profile
  - Trending: Get trending posts
]]

local json = require("json")

-- State
Posts = Posts or {}          -- { postId: { author, content, ... } }
PostCounter = PostCounter or 0
Users = Users or {}          -- { address: { name, bio, followers, following } }
Follows = Follows or {}      -- { follower: { followee: true } }
Likes = Likes or {}          -- { postId: { address: true } }
Comments = Comments or {}    -- { postId: [ comments ] }

local MAX_POST_LENGTH = 280
local MAX_FEED_SIZE = 50

-- Helper: Get or create user
local function getUser(addr)
  if not Users[addr] then
    Users[addr] = {
      address = addr,
      name = nil,
      bio = "",
      createdAt = os.time(),
      postCount = 0,
      followerCount = 0,
      followingCount = 0
    }
  end
  return Users[addr]
end

-- Helper: Count likes
local function getLikeCount(postId)
  local count = 0
  if Likes[postId] then
    for _ in pairs(Likes[postId]) do
      count = count + 1
    end
  end
  return count
end

-- Create a post
Handlers.add("Post", "Post", function(msg)
  local content = msg.Data or msg.Tags.Content

  if not content or content == "" then
    msg.reply({ Tags = { Error = "Content-Required" }, Data = "Post content is required" })
    return
  end

  if #content > MAX_POST_LENGTH then
    msg.reply({
      Tags = { Error = "Too-Long" },
      Data = "Post exceeds " .. MAX_POST_LENGTH .. " characters"
    })
    return
  end

  PostCounter = PostCounter + 1
  local postId = tostring(PostCounter)

  local user = getUser(msg.From)
  user.postCount = user.postCount + 1

  Posts[postId] = {
    id = postId,
    author = msg.From,
    authorName = user.name,
    content = content,
    media = msg.Tags.Media,  -- Optional media attachment
    replyTo = msg.Tags.ReplyTo,  -- If this is a reply
    createdAt = os.time(),
    likes = 0,
    commentCount = 0
  }

  Likes[postId] = {}
  Comments[postId] = {}

  msg.reply({
    Data = json.encode({
      action = "posted",
      post = Posts[postId]
    })
  })
end)

-- Like a post
Handlers.add("Like", "Like", function(msg)
  local postId = msg.Tags.PostId or msg.Tags.Id

  if not postId or not Posts[postId] then
    msg.reply({ Tags = { Error = "Invalid-Post" }, Data = "Post not found" })
    return
  end

  Likes[postId] = Likes[postId] or {}

  if Likes[postId][msg.From] then
    msg.reply({ Tags = { Error = "Already-Liked" }, Data = "You already liked this post" })
    return
  end

  Likes[postId][msg.From] = true
  Posts[postId].likes = getLikeCount(postId)

  -- Notify author
  if Posts[postId].author ~= msg.From then
    ao.send({
      Target = Posts[postId].author,
      Tags = { Action = "Post-Liked", PostId = postId },
      Data = json.encode({ liker = msg.From, postId = postId })
    })
  end

  msg.reply({
    Data = json.encode({
      action = "liked",
      postId = postId,
      likes = Posts[postId].likes
    })
  })
end)

-- Unlike a post
Handlers.add("Unlike", "Unlike", function(msg)
  local postId = msg.Tags.PostId or msg.Tags.Id

  if not postId or not Posts[postId] then
    msg.reply({ Tags = { Error = "Invalid-Post" }, Data = "Post not found" })
    return
  end

  if not Likes[postId] or not Likes[postId][msg.From] then
    msg.reply({ Tags = { Error = "Not-Liked" }, Data = "You haven't liked this post" })
    return
  end

  Likes[postId][msg.From] = nil
  Posts[postId].likes = getLikeCount(postId)

  msg.reply({
    Data = json.encode({
      action = "unliked",
      postId = postId,
      likes = Posts[postId].likes
    })
  })
end)

-- Comment on a post
Handlers.add("Comment", "Comment", function(msg)
  local postId = msg.Tags.PostId or msg.Tags.Id
  local content = msg.Data or msg.Tags.Content

  if not postId or not Posts[postId] then
    msg.reply({ Tags = { Error = "Invalid-Post" }, Data = "Post not found" })
    return
  end

  if not content or content == "" then
    msg.reply({ Tags = { Error = "Content-Required" }, Data = "Comment content is required" })
    return
  end

  Comments[postId] = Comments[postId] or {}

  local user = getUser(msg.From)
  local comment = {
    id = #Comments[postId] + 1,
    author = msg.From,
    authorName = user.name,
    content = content,
    createdAt = os.time()
  }

  table.insert(Comments[postId], comment)
  Posts[postId].commentCount = #Comments[postId]

  -- Notify author
  if Posts[postId].author ~= msg.From then
    ao.send({
      Target = Posts[postId].author,
      Tags = { Action = "Post-Comment", PostId = postId },
      Data = json.encode({ commenter = msg.From, comment = content })
    })
  end

  msg.reply({
    Data = json.encode({
      action = "commented",
      postId = postId,
      comment = comment
    })
  })
end)

-- Follow a user
Handlers.add("Follow", "Follow", function(msg)
  local target = msg.Tags.Target or msg.Tags.User

  if not target then
    msg.reply({ Tags = { Error = "Target-Required" }, Data = "Target user is required" })
    return
  end

  if target == msg.From then
    msg.reply({ Tags = { Error = "Self-Follow" }, Data = "Cannot follow yourself" })
    return
  end

  Follows[msg.From] = Follows[msg.From] or {}

  if Follows[msg.From][target] then
    msg.reply({ Tags = { Error = "Already-Following" }, Data = "You're already following this user" })
    return
  end

  Follows[msg.From][target] = true

  -- Update counts
  local follower = getUser(msg.From)
  local followee = getUser(target)
  follower.followingCount = follower.followingCount + 1
  followee.followerCount = followee.followerCount + 1

  -- Notify
  ao.send({
    Target = target,
    Tags = { Action = "New-Follower" },
    Data = json.encode({ follower = msg.From })
  })

  msg.reply({
    Data = json.encode({
      action = "followed",
      target = target
    })
  })
end)

-- Unfollow a user
Handlers.add("Unfollow", "Unfollow", function(msg)
  local target = msg.Tags.Target or msg.Tags.User

  if not target then
    msg.reply({ Tags = { Error = "Target-Required" }, Data = "Target user is required" })
    return
  end

  if not Follows[msg.From] or not Follows[msg.From][target] then
    msg.reply({ Tags = { Error = "Not-Following" }, Data = "You're not following this user" })
    return
  end

  Follows[msg.From][target] = nil

  -- Update counts
  local follower = getUser(msg.From)
  local followee = getUser(target)
  follower.followingCount = math.max(0, follower.followingCount - 1)
  followee.followerCount = math.max(0, followee.followerCount - 1)

  msg.reply({
    Data = json.encode({
      action = "unfollowed",
      target = target
    })
  })
end)

-- Get feed
Handlers.add("Feed", "Feed", function(msg)
  local limit = tonumber(msg.Tags.Limit) or MAX_FEED_SIZE

  -- Get posts from followed users + own posts
  local following = Follows[msg.From] or {}
  local feed = {}

  for postId, post in pairs(Posts) do
    if post.author == msg.From or following[post.author] then
      table.insert(feed, {
        id = post.id,
        author = post.author,
        authorName = post.authorName or Users[post.author] and Users[post.author].name,
        content = post.content,
        media = post.media,
        createdAt = post.createdAt,
        likes = post.likes,
        commentCount = post.commentCount,
        liked = Likes[post.id] and Likes[post.id][msg.From] or false
      })
    end
  end

  -- Sort by creation time (newest first)
  table.sort(feed, function(a, b)
    return a.createdAt > b.createdAt
  end)

  -- Limit
  if #feed > limit then
    local trimmed = {}
    for i = 1, limit do
      table.insert(trimmed, feed[i])
    end
    feed = trimmed
  end

  msg.reply({
    Data = json.encode({
      feed = feed,
      count = #feed
    })
  })
end)

-- Get user profile
Handlers.add("Profile", "Profile", function(msg)
  local target = msg.Tags.Target or msg.Tags.User or msg.From
  local user = getUser(target)

  -- Get recent posts
  local posts = {}
  for postId, post in pairs(Posts) do
    if post.author == target then
      table.insert(posts, post)
    end
  end

  -- Sort by creation time
  table.sort(posts, function(a, b)
    return a.createdAt > b.createdAt
  end)

  -- Limit to 20
  if #posts > 20 then
    local trimmed = {}
    for i = 1, 20 do
      table.insert(trimmed, posts[i])
    end
    posts = trimmed
  end

  -- Check if requester follows this user
  local isFollowing = Follows[msg.From] and Follows[msg.From][target] or false

  msg.reply({
    Data = json.encode({
      user = user,
      posts = posts,
      isFollowing = isFollowing,
      isOwnProfile = target == msg.From
    })
  })
end)

-- Update profile
Handlers.add("UpdateProfile", "UpdateProfile", function(msg)
  local user = getUser(msg.From)

  if msg.Tags.Name then
    user.name = msg.Tags.Name
  end

  if msg.Tags.Bio or msg.Data then
    user.bio = msg.Tags.Bio or msg.Data
  end

  if msg.Tags.Avatar then
    user.avatar = msg.Tags.Avatar
  end

  msg.reply({
    Data = json.encode({
      action = "profile-updated",
      user = user
    })
  })
end)

-- Get trending posts
Handlers.add("Trending", "Trending", function(msg)
  local limit = tonumber(msg.Tags.Limit) or 20
  local timeframe = tonumber(msg.Tags.Timeframe) or 86400  -- Last 24 hours

  local now = os.time()
  local cutoff = now - timeframe
  local trending = {}

  for postId, post in pairs(Posts) do
    if post.createdAt >= cutoff then
      -- Score = likes + comments * 2
      local score = post.likes + (post.commentCount * 2)
      table.insert(trending, {
        id = post.id,
        author = post.author,
        authorName = post.authorName,
        content = post.content,
        createdAt = post.createdAt,
        likes = post.likes,
        commentCount = post.commentCount,
        score = score,
        liked = Likes[post.id] and Likes[post.id][msg.From] or false
      })
    end
  end

  -- Sort by score
  table.sort(trending, function(a, b)
    return a.score > b.score
  end)

  -- Limit
  if #trending > limit then
    local trimmed = {}
    for i = 1, limit do
      table.insert(trimmed, trending[i])
    end
    trending = trimmed
  end

  msg.reply({
    Data = json.encode({
      trending = trending,
      count = #trending,
      timeframe = timeframe
    })
  })
end)

-- Get post with comments
Handlers.add("GetPost", "GetPost", function(msg)
  local postId = msg.Tags.PostId or msg.Tags.Id

  if not postId or not Posts[postId] then
    msg.reply({ Tags = { Error = "Not-Found" }, Data = "Post not found" })
    return
  end

  local post = Posts[postId]
  local comments = Comments[postId] or {}

  msg.reply({
    Data = json.encode({
      post = post,
      comments = comments,
      liked = Likes[postId] and Likes[postId][msg.From] or false
    })
  })
end)

-- Get followers
Handlers.add("Followers", "Followers", function(msg)
  local target = msg.Tags.Target or msg.From
  local followers = {}

  for follower, following in pairs(Follows) do
    if following[target] then
      local user = getUser(follower)
      table.insert(followers, {
        address = follower,
        name = user.name
      })
    end
  end

  msg.reply({
    Data = json.encode({
      followers = followers,
      count = #followers
    })
  })
end)

-- Get following
Handlers.add("Following", "Following", function(msg)
  local target = msg.Tags.Target or msg.From
  local following = {}

  if Follows[target] then
    for addr, _ in pairs(Follows[target]) do
      local user = getUser(addr)
      table.insert(following, {
        address = addr,
        name = user.name
      })
    end
  end

  msg.reply({
    Data = json.encode({
      following = following,
      count = #following
    })
  })
end)
