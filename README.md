# MYBIKE — сайт аренды байков в Нячанге

Статический SEO-сайт: каждая модель и каждый фильтр — отдельная страница со своим title, description, H1, текстом, FAQ и разметкой schema.org.

## Как устроено

```
data/site.pl        контакты, домен, условия, сравнение, отзывы, FAQ главной   ← TODO-поля заменить
data/bikes.pl       парк байков: цены, характеристики, тексты (1 байк = 1 страница /arenda/<slug>/)
data/categories.pl  посадочные страницы фильтров (без прав, 50cc, электро, 110–125, 150–160, 300+, мото…)
data/pages.pl       инфо-страницы: права во Вьетнаме, как арендовать, доставка, о нас, контакты…
src/assets/         CSS, JS, картинки (фото байков — src/assets/img/bikes/)
build.pl            генератор → docs/
serve.pl            локальный предпросмотр
docs/               готовый сайт (заливается на хостинг как есть)
```

## Сборка и предпросмотр

Нужен только Perl (есть в Git for Windows).

```bash
perl build.pl
perl serve.pl 8080   # http://localhost:8080
```

## Тестовая копия на GitHub Pages

Живой адрес: https://t0niske.github.io/mybike-nhatrang/ (Pages раздаёт папку `docs/` из ветки `main`).

```bash
sh build-pages.sh    # сборка с путями /mybike-nhatrang/ и noindex
git add -A && git commit -m "Обновление сайта" && git push
```

Копия на github.io закрыта от индексации, чтобы не конкурировать в поиске с основным доменом. Для боевого домена укажите его в `data/site.pl` и соберите обычным `perl build.pl`.

## Что генерируется для SEO / GEO

- 19 страниц байков + 10 страниц фильтров + каталог + инфо-страницы
- schema.org: AutoRental/LocalBusiness, Product + AggregateOffer, FAQPage, BreadcrumbList, ItemList, OfferCatalog
- `sitemap.xml`, `robots.txt` (с Clean-param для Яндекса), `llms.txt` для ИИ-поисковиков, canonical, Open Graph, geo-метатеги
- цены, сравнение и FAQ — в HTML (видны поисковикам без JS)

## Как добавить байк

Скопируйте блок в `data/bikes.pl`, поменяйте `slug`, цены и тексты, положите фото в `src/assets/img/bikes/` и укажите `img=>'файл.jpg'`. Запустите `perl build.pl`.
