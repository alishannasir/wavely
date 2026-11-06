-- Atomic matchmaking step.
-- KEYS[1] = queue zset (member = userId, score = queuedAt ms)
-- ARGV[1] = now (ms)
-- ARGV[2] = entry JSON for the searching user (includes queuedAt)
-- ARGV[3] = ms before a country preference is ignored
-- ARGV[4] = ms before a gender preference is ignored
-- ARGV[5] = entry TTL (seconds)
-- ARGV[6] = recent-partner window (ms)
-- ARGV[7] = '1' when re-scanning a user who should still be waiting: if they are no longer in the
--           queue (left, matched elsewhere) nothing is claimed and they are NOT re-queued.
-- Returns the claimed peer's entry JSON, or false after queueing the searcher.
local queue = KEYS[1]
local now = tonumber(ARGV[1])
local me = cjson.decode(ARGV[2])
local relaxCountry = tonumber(ARGV[3])
local relaxGender = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local recentWindow = tonumber(ARGV[6])
local rescan = ARGV[7] == '1'

local function prefs(e)
  local waited = now - (tonumber(e.queuedAt) or now)
  local pg = e.preferredGender
  local pc = e.preferredCountry
  if pg == cjson.null or pg == '' or waited >= relaxGender then pg = nil end
  if pc == cjson.null or pc == '' or waited >= relaxCountry then pc = nil end
  return pg, pc
end

local function val(v)
  if v == cjson.null then return nil end
  return v
end

local function wants(a, b)
  local pg, pc = prefs(a)
  if pg and val(b.gender) ~= pg then return false end
  if pc and val(b.country) ~= pc then return false end
  return true
end

local function flagged(e) return e.flagged == true end

if rescan and not redis.call('ZSCORE', queue, me.userId) then
  return false
end

-- Never queue the same user twice.
redis.call('ZREM', queue, me.userId)
redis.call('DEL', 'mm:entry:' .. me.userId)

local recent = {}
local recentIds = redis.call('ZRANGEBYSCORE', 'mm:recent:' .. me.userId, now - recentWindow, '+inf')
for _, id in ipairs(recentIds) do recent[id] = true end

-- Blocks are mirrored into mm:block:<userId> (both directions), see BlocksService.
local blockKey = 'mm:block:' .. me.userId

local ids = redis.call('ZRANGE', queue, 0, -1)
for _, id in ipairs(ids) do
  if id ~= me.userId and not recent[id] and redis.call('SISMEMBER', blockKey, id) == 0 then
    local raw = redis.call('GET', 'mm:entry:' .. id)
    if not raw then
      redis.call('ZREM', queue, id) -- expired entry
    else
      local cand = cjson.decode(raw)
      if flagged(me) == flagged(cand) and wants(me, cand) and wants(cand, me) then
        redis.call('ZREM', queue, id)
        redis.call('DEL', 'mm:entry:' .. id)
        return raw
      end
    end
  end
end

redis.call('SET', 'mm:entry:' .. me.userId, ARGV[2], 'EX', ttl)
redis.call('ZADD', queue, me.queuedAt, me.userId)
return false
