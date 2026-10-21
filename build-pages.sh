#!/bin/sh
# Сборка тестовой копии для GitHub Pages: https://t0niske.github.io/mybike-nhatrang/
# Страницы помечены noindex, чтобы github.io не конкурировал в поиске с будущим основным доменом.
# Для боевого домена:  perl build.pl  (домен — в data/site.pl)
BASE=/mybike-nhatrang SITE_URL=https://t0niske.github.io/mybike-nhatrang PREVIEW=1 perl "$(dirname "$0")/build.pl"
