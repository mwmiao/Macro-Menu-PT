#!/bin/sh
# Stamps a built web root with a release id (run by the Dockerfile; also usable locally):
#   sh docker/stamp-release.sh <web-root> <release-id>
# Every relative ES-module import and the page's CSS/JS links get "?v=<id>", so each release has
# new code URLs and no cache (browser, Cloudflare, service worker) can mix in an older module.
set -eu
root="$1"
v="$2"
cd "$root"
find js -name '*.js' -exec sed -i -E "s#(from '\.{1,2}/[^'?]+\.js)'#\1?v=${v}'#g" {} +
sed -i -E "s#(href=\"css/styles\.css)\"#\1?v=${v}\"#; s#(src=\"js/app\.js)\"#\1?v=${v}\"#" index.html
sed -i "s#mm-dev#mm-${v}#" sw.js
sed -i "s#build: 'dev'#build: '${v}'#" js/config.js
grep -q "app.js?v=${v}" index.html
grep -q "state.js?v=${v}" js/app.js
echo "stamped release ${v}"
