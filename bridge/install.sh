#!/bin/sh
# Installs the Zetamac Tracker local bridge (Chrome native messaging host).
#   ./bridge/install.sh                       data goes to ~/.zetamac-tracker only
#   ./bridge/install.sh --notes /path/page.md also keep a Markdown notes page updated
set -eu

HOST_NAME="com.zetamac_tracker.bridge"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found on PATH" >&2; exit 1; }

NOTES=""
if [ "${1:-}" = "--notes" ]; then
  NOTES="${2:?--notes needs a path}"
fi

# Chrome derives an unpacked extension's ID from its folder path.
EXT_ID="${ZT_EXTENSION_ID:-$("$NODE" -e "
const h = require('crypto').createHash('sha256').update(process.argv[1]).digest('hex').slice(0, 32);
console.log([...h].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(''));
" "$REPO")}"

# Chrome launches hosts with a minimal PATH, so pin the node binary.
WRAPPER="$REPO/bridge/zt-host"
cat > "$WRAPPER" <<EOF
#!/bin/sh
exec "$NODE" "$REPO/bridge/host.js"
EOF
chmod +x "$WRAPPER"

MANIFEST="{
  \"name\": \"$HOST_NAME\",
  \"description\": \"Zetamac Tracker local bridge\",
  \"path\": \"$WRAPPER\",
  \"type\": \"stdio\",
  \"allowed_origins\": [\"chrome-extension://$EXT_ID/\"]
}"

case "$(uname -s)" in
  Darwin) BASE="$HOME/Library/Application Support"
          set -- "$BASE/Google/Chrome" "$BASE/Chromium" "$BASE/BraveSoftware/Brave-Browser" "$BASE/Microsoft Edge" "$BASE/Arc/User Data" ;;
  Linux)  set -- "$HOME/.config/google-chrome" "$HOME/.config/chromium" "$HOME/.config/BraveSoftware/Brave-Browser" "$HOME/.config/microsoft-edge" ;;
  *) echo "Unsupported OS; see README for manual setup" >&2; exit 1 ;;
esac

installed=0
for browser_dir in "$@"; do
  if [ -d "$browser_dir" ]; then
    mkdir -p "$browser_dir/NativeMessagingHosts"
    printf '%s\n' "$MANIFEST" > "$browser_dir/NativeMessagingHosts/$HOST_NAME.json"
    echo "Installed host manifest in $browser_dir"
    installed=1
  fi
done
[ "$installed" = 1 ] || { echo "No supported browser profile folder found" >&2; exit 1; }

ZT_HOME_DIR="${ZT_HOME:-$HOME/.zetamac-tracker}"
mkdir -p "$ZT_HOME_DIR"
if [ -n "$NOTES" ]; then
  "$NODE" -e "
const fs = require('fs'); const f = process.argv[1];
let c = {}; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
c.notesPage = process.argv[2];
fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
" "$ZT_HOME_DIR/config.json" "$NOTES"
  echo "Notes page: $NOTES"
fi

echo "Extension ID: $EXT_ID"
echo "Done. Reload the extension in chrome://extensions so it picks up the bridge."
