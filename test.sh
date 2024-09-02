#!/bin/sh

node --trace-deprecation ./index.js /var/www/bb/staging/current/var/log '^prod-(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})\.log$' --keep-files=3
