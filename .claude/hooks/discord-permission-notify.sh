#!/usr/bin/env bash
# Fires on Claude Code's Notification hook event (which triggers when Claude
# needs permission to run a tool). Posts a Discord message with:
#   - Overall task (latest user request)           -> forum thread title
#   - Specific task (short verb description of the
#     command being run, e.g. "Delete file(s)")   -> message "Task:"
#   - Claude's own prose describing what it's
#     about to do (from the awaiting-approval turn) -> message "What I'm doing:"
#   - The full command / path / URL                -> message "Command:"
#
# Thread routing: each distinct overall task gets its own Discord forum
# thread (titled with the task), and every permission request for that task
# is posted into the same thread so you can follow an in-progress task in one
# place. The thread id for a task is looked up from a state file; if none
# exists a new thread is created (via the webhook `thread_name` field) and
# its id is recorded for reuse.
#
# NOTE: a Discord webhook can only *create* threads in a Forum channel. If
# the webhook points at a normal text channel, thread creation is skipped
# and the message is posted to the channel directly (with a clear log line)
# so notifications still go out.
#
# The Discord webhook URL is read from $DISCORD_WEBHOOK, loaded from the
# project's .env (gitignored). If it is unset, the hook exits silently.
#
# Deliberately NO `set -e`/`set -u` here: every step is best-effort with
# explicit fallbacks, so a single failing command never aborts the whole
# hook before the Discord post goes out. Set DISCORD_NOTIFY_DEBUG=1 to print
# the rendered message instead of posting it. A one-line trace is appended
# to /tmp/discord-hook.log on every run so you can confirm it fires.

LOG=/tmp/discord-hook.log
# Map of task-key -> {task, thread_id, ts}. Persists across hook invocations
# so follow-up permission requests for the same task land in one thread.
STATE=/tmp/discord-task-threads.json
[ -f "$STATE" ] || echo '{}' > "$STATE" 2>/dev/null || true

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$1" >> "$LOG" 2>/dev/null || true; }

log "hook fired"

in=$(cat)
cwd=$(printf '%s' "$in" | jq -r '.cwd // ""' 2>/dev/null || printf '')
tp=$(printf '%s' "$in" | jq -r '.transcript_path // ""' 2>/dev/null || printf '')
msg=$(printf '%s' "$in" | jq -r '.message // "Claude needs your approval"' 2>/dev/null || printf 'Claude needs your approval')

# Load webhook from project .env if present
if [ -n "$cwd" ] && [ -f "$cwd/.env" ]; then
  set -a; . "$cwd/.env" 2>/dev/null || true; set +a
fi

if [ -z "${DISCORD_WEBHOOK:-}" ]; then
  envpresent=no; [ -n "$cwd" ] && [ -f "$cwd/.env" ] && envpresent=yes
  log "no DISCORD_WEBHOOK in env (cwd set=$([ -n "$cwd" ] && echo yes || echo no), .env present=$envpresent)"
  exit 0
fi
log "webhook present, building message"

# The webhook's own channel id (from the webhook URL's GET), used to detect
# whether a create-response channel_id is a freshly-made thread vs the base
# channel. Fetched once and cached in the state file.
webhook_channel=$(jq -r '.webhook_channel // empty' "$STATE" 2>/dev/null || printf '')

content=""
# No transcript to read -> fall back to the raw notification message
if [ -n "$tp" ] && [ -f "$tp" ]; then
  content=$(jq -sr '
    # Content blocks of an entry, tolerant of shape (.message may be an
    # object with .content, an array, or missing).
    def blocks:
      (if (.message | type) == "object" then (.message.content // []) else [] end)
      | if type == "array" then . else [] end;

    # User-typed text from a user entry (content may be a string or an array
    # of blocks; skip entries that only contain tool_result blocks).
    def userText:
      (.message.content // [])
      | if type == "string" then .
        else ([.[] | select(.type == "text") | .text] | join(" ")) end;

    # A short verb-based description of what a single Bash command does, from
    # its first token. Multi-statement commands fall back to a generic label.
    def bashLabel:
      (.command // "") as $c
      | ($c | split("\n") | map(select(test("\\S"))) | .[0] // "") as $line
      | ($line | gsub("^\\s+";"") | split(" ") | .[0] // "") as $v
      | (if ($c | test("&&|;|\\|")) then "Run shell command(s)"
         elif $v == "rm"     then "Delete file(s)"
         elif $v == "rmdir"  then "Remove directory"
         elif $v == "mkdir"  then "Create directory"
         elif $v == "touch"  then "Create file"
         elif $v == "cp"     then "Copy file(s)"
         elif $v == "mv"     then "Move/rename file(s)"
         elif $v == "cat"    then "Read file"
         elif ($v == "tail" or $v == "head") then "Read file (tail)"
         elif $v == "ls"     then "List files"
         elif ($v == "grep" or $v == "rg") then "Search text"
         elif $v == "find"   then "Find files"
         elif $v == "sed"    then "Edit file text"
         elif $v == "chmod"  then "Change permissions"
         elif ($v == "curl" or $v == "wget") then "HTTP request"
         elif ($v == "npm" or $v == "pnpm" or $v == "yarn" or $v == "npx")
              then "Run " + $line
         elif $v == "git"    then "Git: " + ($line | split(" ") | .[1] // "operation")
         elif $v == "docker" then "Docker: " + ($line | split(" ") | .[1] // "operation")
         elif ($v == "python" or $v == "python3") then "Run Python script"
         elif $v == "node"   then "Run Node script"
         else "Run shell command" end);

    # {label, full} for each tool_use awaiting approval: `label` is a short
    # human description (the "specific task"), `full` is the raw command/path.
    def toolInfo:
      [blocks | .[]
        | select(.type == "tool_use")
        | .name as $n | .input
        | if $n == "Bash" then {label: bashLabel, full: ((.command // "") | tostring)}
          elif $n == "Write"        then {label: "Write file",        full: ((.file_path // "") | tostring)}
          elif $n == "Edit"         then {label: "Edit file",         full: ((.file_path // "") | tostring)}
          elif $n == "Read"         then {label: "Read file",         full: ((.file_path // "") | tostring)}
          elif $n == "NotebookEdit" then {label: "Update notebook",   full: ((.file_path // "") | tostring)}
          elif $n == "WebFetch"     then {label: "Fetch URL",         full: ((.url // "") | tostring)}
          else {label: ("Use " + $n), full: (. | tostring)} end];

    # Latest real user request (skip tool_result-only entries + blanks).
    ([.[] | select(.type == "user" and (.message | type) == "object")
       | select((.message.content | type) == "string"
                or ([.message.content // [] | .[] | select(.type == "text")] | length) > 0)
       | userText]
      | map(select(. != "" and . != null)) | .[-1] // "") as $task
    | # Latest assistant turn with a tool_use (the one awaiting approval).
    # Each assistant turn is split across multiple JSONL entries (thinking /
    # text / tool_use) that all share one message.id; group them by it.
    ([.[] | select(.type == "assistant")
       | select((.message.content // []) | any(.type == "tool_use"))]
      | map(.message.id) | .[-1] // "") as $turn_id
    | # Claude prose for that turn: every text block sharing the turn id.
    (if $turn_id == null or $turn_id == "" then ""
     else ([.[] | select(.type == "assistant" and .message.id == $turn_id)
            | (.message.content // [])[] | select(.type == "text") | .text]
            | join(" ")) // "" end) as $desc
    | # Latest assistant entry (the tool_use line) for tool info.
    ([.[] | select(.type == "assistant" and ((blocks) | length) > 0)]) as $a
    | (if ($a | length) == 0 then {task: $task, label: "", full: "", desc: $desc}
       else ($a[-1] | toolInfo) as $t
            | {task: $task,
               label: ($t[0].label // ""),
               full:  ([$t[] | .full] | join("\n")),
               desc:  $desc} end)
  ' "$tp" 2>/dev/null || printf '')
fi

task=""; label=""; full=""; desc=""
if [ -n "${content:-}" ]; then
  task=$(printf  '%s' "$content" | jq -r '.task  // ""' 2>/dev/null || printf '')
  label=$(printf '%s' "$content" | jq -r '.label // ""' 2>/dev/null || printf '')
  full=$(printf  '%s' "$content" | jq -r '.full  // ""' 2>/dev/null || printf '')
  desc=$(printf  '%s' "$content" | jq -r '.desc  // ""' 2>/dev/null || printf '')
fi

# Trim + truncate to stay well under Discord's 2000-char content limit.
task=${task:0:200}
label=${label:0:150}
full=${full:0:1100}
desc=${desc:0:400}
# Flatten the description to one line so it doesn't break the layout.
desc=$(printf '%s' "$desc" | tr '\n\r' ' ' | tr -s ' ' | sed 's/^ //; s/ $//')

# Fallbacks when fields are empty.
[ -n "$task" ]  || task="(no task title found)"
[ -n "$label" ] || label="$msg"
[ -n "$full" ]  || full="$msg"

# Stable key for the overall task name: normalize whitespace + lowercase,
# then hash so the state file stays clean and lookups are robust to minor
# formatting. All permission requests for one overall task share a thread.
task_key=$(printf '%s' "$task" \
  | tr '[:upper:]' '[:lower:]' \
  | tr -s ' \t\n' ' ' \
  | sed 's/^ //; s/ $//' \
  | sha256sum 2>/dev/null | cut -d' ' -f1)
[ -n "$task_key" ] || task_key="default"

# Forum thread title = the overall task (Discord caps thread names at 100).
thread_name=$(printf '%s' "$task" | tr '\n\r' ' ' | tr -s ' ' | sed 's/^ //; s/ $//' | cut -c1-100)

# Message body: the specific task, Claude's own description of what it's
# doing (when present), then the full command.
if [ -n "$desc" ]; then
  content=$(printf '🔔 **Claude needs your permission**\n\n**Task:** %s\n**What I'\''m doing:** %s\n**Command:**\n```\n%s\n```' \
    "$label" "$desc" "$full")
else
  content=$(printf '🔔 **Claude needs your permission**\n\n**Task:** %s\n**Command:**\n```\n%s\n```' \
    "$label" "$full")
fi

log "sending: task=${task:0:60} | label=${label:0:40} | desc=${desc:0:40} | key=${task_key:0:8}"

# Debug mode: print the message that would be sent and skip the webhook call.
if [ "${DISCORD_NOTIFY_DEBUG:-}" = "1" ]; then
  printf 'TASK(overall): %s\nTHREAD NAME: %s\nKEY: %s\nDESC: %s\n---\n%s\n' "$task" "$thread_name" "$task_key" "$desc" "$content"
  exit 0
fi

# --- Helpers -------------------------------------------------------------

# jq wrapper that never fails the hook: reads state, applies a transform,
# writes atomically via a temp file.
state_write() {
  # $1 = jq filter (with --arg passthrough already in $JQARGS)
  local tmp
  tmp=$(mktemp 2>/dev/null) || return 1
  if jq "$@" "$STATE" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    mv "$tmp" "$STATE" 2>/dev/null || { rm -f "$tmp"; return 1; }
  else
    rm -f "$tmp"; return 1
  fi
}

# POST a payload to a URL; echoes "<http_code>|<body>". Best-effort.
discord_post() {
  # $1 = url, $2 = payload json
  local url="$1" payload="$2" body http
  body=$(mktemp 2>/dev/null) || body=/tmp/.dh-resp.$$
  http=$(printf '%s' "$payload" \
    | curl -s -m 10 -o "$body" -w '%{http_code}' -X POST \
        -H "Content-Type: application/json" -d @- "$url" 2>/dev/null || printf 'ERR')
  printf '%s|%s' "$http" "$(cat "$body" 2>/dev/null || printf '')"
  rm -f "$body" 2>/dev/null || true
}

# --- Resolve webhook channel id (cached once) ---------------------------
if [ -z "$webhook_channel" ]; then
  wc=$(curl -s -m 10 "$DISCORD_WEBHOOK" 2>/dev/null \
       | jq -r '.channel_id // empty' 2>/dev/null || printf '')
  if [ -n "$wc" ]; then
    webhook_channel="$wc"
    state_write --arg c "$wc" '. + {webhook_channel:$c}' || true
  fi
fi

# --- Look up an existing thread for this task ---------------------------
thread_id=$(jq -r --arg k "$task_key" '.[$k].thread_id // empty' "$STATE" 2>/dev/null || printf '')

# --- Reply into the existing thread, if any -----------------------------
if [ -n "$thread_id" ]; then
  url="${DISCORD_WEBHOOK}?thread_id=${thread_id}"
  payload=$(jq -n -c --arg c "$content" '{content:$c}' 2>/dev/null)
  result=$(discord_post "$url" "$payload")
  http=${result%%|*}; body=${result#*|}
  if printf '%s' "$http" | grep -qE '^(2|3)[0-9][0-9]$'; then
    log "replied in thread=$thread_id http=$http"
    exit 0
  fi
  # Thread is gone / archived-unrecoverable / wrong channel: drop the stale
  # mapping and fall through to create a fresh thread.
  log "reply failed http=$http body=${body:0:120}; will recreate thread"
  state_write --arg k "$task_key" 'del(.[$k])' || true
  thread_id=""
fi

# --- Create a new thread for this task ----------------------------------
url="${DISCORD_WEBHOOK}?wait=true"
payload=$(jq -n -c --arg c "$content" --arg tn "$thread_name" '{content:$c, thread_name:$tn}' 2>/dev/null)
result=$(discord_post "$url" "$payload")
http=${result%%|*}; body=${result#*|}
new_chan=$(printf '%s' "$body" | jq -r '.channel_id // empty' 2>/dev/null || printf '')

# A fresh thread was created iff the returned channel_id differs from the
# webhook's base channel (forum channels return the new thread's id here).
if [ -n "$http" ] && printf '%s' "$http" | grep -qE '^(2|3)[0-9][0-9]$' \
   && [ -n "$new_chan" ] && [ "$new_chan" != "$webhook_channel" ]; then
  state_write --arg k "$task_key" --arg t "$task" --arg id "$new_chan" \
    '.[$k] = {task:$t, thread_id:$id, ts:(now|todate)}' || true
  log "created thread=$new_chan for key=${task_key:0:8} http=$http"
  exit 0
fi

# Thread creation failed (e.g. channel is not a Forum channel -> error 220003,
# or any other non-2xx). Fall back to a plain channel post so the notification
# still reaches Discord, and surface the reason in the log.
log "thread create failed http=$http body=${body:0:120}; falling back to plain post"
payload=$(jq -n -c --arg c "$content" '{content:$c}' 2>/dev/null)
result=$(discord_post "$DISCORD_WEBHOOK" "$payload")
http=${result%%|*}
log "posted plain http=$http"