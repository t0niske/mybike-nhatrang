#!/usr/bin/perl
# Генератор статического сайта MYBIKE.  Запуск:  perl build.pl
# Результат — папка docs/ (готова для GitHub Pages / любого хостинга).
use strict;
use warnings;
use utf8;
use FindBin qw($Bin);
use File::Path qw(make_path remove_tree);
use File::Copy qw(copy);
use File::Find;
use JSON::PP;
use POSIX qw(strftime ceil);
use Digest::MD5;
binmode STDOUT, q{:encoding(UTF-8)};

our (%SITE, @INCLUDED, @COMPARE, @STEPS, @REVIEWS, @FAQ_MAIN, @BIKES, @CATEGORIES, @PAGES, @DELIVERY);
for my $f (qw(site bikes categories pages)) {
  my $r = do "$Bin/data/$f.pl";
  die "data/$f.pl: $@" if $@;
  die "data/$f.pl: $!" unless defined $r;
}

# Данные из админки: GitHub Actions выгружает их из базы в data/remote.json (или файл скачан в «Публикация»).
# Если файла нет — сайт собирается из data/*.pl.
if (-f "$Bin/data/remote.json" && !$ENV{NO_REMOTE}) {
  open my $rf, '<:raw', "$Bin/data/remote.json" or die "remote.json: $!";
  my $raw = do { local $/; <$rf> }; close $rf;
  apply_remote(JSON::PP->new->utf8->decode($raw));
  print "Контент и цены взяты из data/remote.json\n";
}

sub tuples { my ($list, @k) = @_; [ map { my $o = $_; ref $o eq 'ARRAY' ? $o : [ map { $o->{$_} // '' } @k ] } @{ $list || [] } ] }
sub apply_remote {
  my $r = shift; my $c = $r->{content} || {};
  if ($r->{bikes} && @{ $r->{bikes} }) {
    @BIKES = map {
      my %b = %$_; $b{slug} = delete $b{id}; $b{group} = delete $b{grp};
      $b{$_} = $b{$_} ? 1 : 0 for qw(abs popular);
      $b{$_} ||= [] for qw(tags about pros);
      \%b
    } grep { !defined $_->{visible} || $_->{visible} } @{ $r->{bikes} };
  }
  if ($c->{site}) { for my $k (keys %{ $c->{site} }) { my $v = $c->{site}{$k}; $SITE{$k} = $v if defined $v && $v ne '' } }
  @REVIEWS  = @{ tuples($c->{reviews},  qw(name city text)) }  if $c->{reviews};
  @FAQ_MAIN = @{ tuples($c->{faq_main}, qw(q a)) }             if $c->{faq_main};
  @INCLUDED = @{ tuples($c->{included}, qw(icon title text)) } if $c->{included};
  @COMPARE  = @{ tuples($c->{compare},  qw(row us them)) }     if $c->{compare};
  @DELIVERY = @{ tuples($c->{delivery}, qw(place price time)) } if $c->{delivery};
  @STEPS    = @{ tuples($c->{steps},    qw(title text)) }      if $c->{steps};
  @CATEGORIES = map { my %x = %$_; $x{sections} = tuples($x{sections}, qw(h2 html)); $x{faq} = tuples($x{faq}, qw(q a)); \%x } @{ $c->{categories} } if $c->{categories};
  @PAGES = map {
    my %x = %$_; $x{faq} = tuples($x{faq}, qw(q a)); delete $x{faq} unless @{ $x{faq} }; $x{noindex} = $x{noindex} ? 1 : 0; \%x
  } @{ $c->{pages} } if $c->{pages};
}

my $OUT   = "$Bin/docs";
my $B     = $ENV{BASE} // $SITE{base};
$SITE{url} = $ENV{SITE_URL} if $ENV{SITE_URL};
my $PREVIEW = $ENV{PREVIEW};   # 1 = тестовая копия: noindex на всех страницах
my $TODAY = strftime('%Y-%m-%d', localtime);
my $CARD_DAYS = 7;   # срок по умолчанию в карточках байков и в ползунке «для всех»
my $MAX_DAYS  = 365; # потолок срока в карточке (дольше года — договорная аренда)
my $VER   = src_hash();   # версия CSS/JS меняется только при изменении файлов
my @SITEMAP;
my $JSON  = JSON::PP->new->canonical->pretty(0);
my %BIKE  = map { $_->{slug} => $_ } @BIKES;

my %GROUP = (
  '50'  => ['50 см³', 'Без прав'],
  'e'   => ['Электро', ''],
  '125' => ['110–125 см³', ''],
  '150' => ['150–160 см³', ''],
  '300' => ['300+ см³', ''],
  'moto'=> ['Мотоциклы', ''],
);
my @GROUP_ORDER = qw(50 e 125 150 300 moto);

# ------------------------------------------------------------ helpers
sub esc { my $s = shift // ''; $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; $s =~ s/"/&quot;/g; $s }
sub u   { "$B" . shift }
sub abs_url { $SITE{url} . shift }
sub fill {
  my $s = shift;
  $s =~ s/\{base\}/$B/g;
  $s =~ s/\{(phone|telegram|whatsapp|email|address|lat|lng)\}/$SITE{$1}/g;
  $s =~ s/\{table:delivery\}/delivery_table()/ge;
  $s;
}
sub strip { my $s = shift; $s =~ s/<[^>]+>//g; $s =~ s/\{base\}//g; $s }
sub num { my $n = int($_[0] + 0.5); 1 while $n =~ s/^(\d+)(\d{3})/$1\x{a0}$2/; $n }
sub vnd { num(shift) . "\x{a0}₫" }
sub rub { '≈' . "\x{a0}" . num(ceil($_[0] / $SITE{rub_rate} / 10) * 10) . "\x{a0}₽" }
# три ступени цены за день: 1–6 дней, от 7 дней, от 30 дней (цена месяца / 30); итог = цена за день × дни
sub rate { my ($b, $d) = @_; $d >= 30 ? $b->{pm} / 30 : $d >= 7 ? $b->{p7} : $b->{p1} }
sub cost { my ($b, $d) = @_; rate($b, $d) * $d }
sub r100 { int($_[0] / 100 + 0.5) * 100 }
sub lic_label { my $l = shift; $l eq 'none' ? 'Без прав' : $l eq 'A1' ? 'Права A1 / A' : 'Права A' }
sub lic_text {
  my $b = shift;
  return "Права не нужны: $b->{name} относится к мопедам (до 50 см³ / до 50 км/ч). Достаточно быть старше 16 лет." if $b->{license} eq 'none';
  return "Нужны национальные права категории A1 или A и международное водительское удостоверение (МВУ)." if $b->{license} eq 'A1';
  return "Нужны национальные права категории A и международное водительское удостоверение (МВУ).";
}
sub cc_label { my $b = shift; $b->{cc} ? "$b->{cc} см³" : 'Электро' }
# в поле img можно указать несколько фото через запятую или пробел: первое — главное, остальные — в галерее страницы байка
sub photos { my $b = shift; my @p = grep { length } split /[\s,]+/, $b->{img} // ''; @p ? @p : ('placeholder.png') }
sub img { (photos(shift))[0] }
sub photo_url { my $i = shift; $i =~ m{^https?://} ? $i : u('/assets/img/bikes/' . $i) }
sub img_url { photo_url(img(shift)) }
sub img_abs { my $i = img(shift); $i =~ m{^https?://} ? $i : abs_url('/assets/img/bikes/' . $i) }
sub src_hash {
  my $ctx = Digest::MD5->new;
  find({ no_chdir=>1, wanted=>sub { return unless -f $_ && /\.(css|js|html)$/; open my $fh, '<:raw', $_ or return; $ctx->addfile($fh) } }, "$Bin/src");
  substr($ctx->hexdigest, 0, 10);
}
sub min_p { my @b = @_; my ($m) = sort { $a <=> $b } map { $_->{p7} } @b; $m }

# типографика HTML: короткие слова (предлоги, союзы, числа) не висят в конце строки,
# тире не переносится в начало новой строки; теги, script и style не трогаем
sub typo {
  my @parts = split /(<script\b.*?<\/script>|<style\b.*?<\/style>|<[^>]*>)/s, shift;
  for (@parts) {
    next if /^</;
    s/(?<![\p{L}\d])(?!(?:ли|же|бы)\b)(\p{L}{1,2}|\d{1,3}) (?=\S)/$1\x{a0}/g;
    s/ (—|–)/\x{a0}$1/g;
  }
  join '', @parts;
}

sub write_file {
  my ($path, $content) = @_;
  my $full = "$OUT$path";
  $full .= 'index.html' if $full =~ m{/$};
  $content = typo($content) if $full =~ /\.html$/;
  (my $dir = $full) =~ s{/[^/]+$}{};
  make_path($dir);
  open my $fh, '>:encoding(UTF-8)', $full or die "$full: $!";
  print $fh $content;
  close $fh;
}

# ------------------------------------------------------------ icons
my %IC = (
  check   => '<path d="M20 6 9 17l-5-5"/>',
  arrow   => '<path d="M5 12h14M13 5l7 7-7 7"/>',
  chev    => '<path d="m6 9 6 6 6-6"/>',
  search  => '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  calendar=> '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  shield  => '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  passport=> '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 10h3M15 14h3M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/>',
  truck   => '<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/>',
  helmet  => '<path d="M3 16a9 9 0 0 1 18 0v2H3z"/><path d="M12 7v5h9"/>',
  rain    => '<path d="M22 12a10 10 0 0 0-20 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
  wrench  => '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  chat    => '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  card    => '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  bolt    => '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  coin    => '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2A2.6 2.6 0 0 0 12 7.8c-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.6 2.6 0 0 1-2.5-1.5M12 6v1.8M12 16.2V18"/>',
  pin     => '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  clock   => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gauge   => '<path d="m12 14 4-4"/><path d="M3.3 19a9 9 0 1 1 17.4 0"/>',
  users   => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  fuel    => '<path d="M3 22h11M4 9h9M13 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M13 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.8a2 2 0 0 0-.6-1.4L18 5"/>',
  scooter => '<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h7.5l2.5-7h-3M14 5h2.5l1.5 5.5M5.5 15l2-4H13"/>',
  moto    => '<circle cx="5" cy="16" r="3"/><circle cx="19" cy="16" r="3"/><path d="M8 16h5l3-6h-4l-2 3H5M15 6h2l2 10"/>',
  nolicense=> '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 3l18 18"/>',
  calendarm=> '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h2M14 14h2M8 18h2"/>',
  phone   => '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail    => '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  menu    => '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close   => '<path d="M18 6 6 18M6 6l12 12"/>',
  star    => '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
);
my %ICF = (  # заливные иконки брендов
  telegram => '<path d="M9.8 15.6 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7L20.9 5c.3-1.2-.4-1.6-1.2-1.3L2.9 10.2c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 9.9-6.3c.5-.3.9-.1.6.2z"/>',
  whatsapp => '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2z"/>',
  vk       => '<path d="M13.2 18c-6.1 0-9.6-4.2-9.7-11.2h3c.1 5.1 2.4 7.3 4.2 7.8V6.8h2.9v4.4c1.8-.2 3.6-2.2 4.3-4.4h2.8a8.5 8.5 0 0 1-3.9 5.6 8.8 8.8 0 0 1 4.6 5.6h-3.2c-.7-2.2-2.4-3.9-4.6-4.1V18z"/>',
);
sub icon {
  my ($n, $cls) = @_;
  $cls = $cls ? qq{ class="$cls"} : '';
  return qq{<svg$cls viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">$ICF{$n}</svg>} if $ICF{$n};
  qq{<svg$cls viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">} . ($IC{$n} // '') . '</svg>';
}

# ------------------------------------------------------------ schema.org
sub org_ld {
  return +{
    '@type' => ['AutoRental', 'LocalBusiness'], '@id' => abs_url('/#org'),
    name => $SITE{name}, alternateName => $SITE{legal_name}, url => abs_url('/'),
    logo => abs_url('/assets/img/logo.svg'), image => abs_url('/assets/img/bikes/placeholder.png'),
    description => 'Аренда скутеров, мотоциклов и электроскутеров в Нячанге без залога паспорта. Бесплатная доставка в отель с первого дня аренды.',
    telephone => $SITE{phone_raw}, email => $SITE{email}, priceRange => '100000–1300000 VND',
    currenciesAccepted => 'VND, RUB, USD, USDT', paymentAccepted => 'Cash, Bank transfer, Cryptocurrency',
    address => { '@type'=>'PostalAddress', streetAddress=>$SITE{street}, addressLocality=>'Nha Trang', addressRegion=>'Khánh Hòa', addressCountry=>'VN' },
    geo => { '@type'=>'GeoCoordinates', latitude=>$SITE{lat}+0, longitude=>$SITE{lng}+0 },
    areaServed => [ map { +{ '@type'=>'Place', name=>$_ } } 'Нячанг', 'Камрань', 'Кханьхоа' ],
    sameAs => [ "https://t.me/$SITE{telegram}", $SITE{vk} ],
    knowsLanguage => ['ru', 'en', 'vi'],
  }
}
sub crumbs_ld {
  my @c = @_; my $i = 0;
  return +{ '@type'=>'BreadcrumbList', itemListElement=>[ map { +{ '@type'=>'ListItem', position=>++$i, name=>$_->[0], item=>abs_url($_->[1]) } } @c ] }
}
sub faq_ld {
  my @f = @_;
  return +{ '@type'=>'FAQPage', mainEntity=>[ map { +{ '@type'=>'Question', name=>$_->[0], acceptedAnswer=>{ '@type'=>'Answer', text=>strip(fill($_->[1])) } } } @f ] }
}
sub product_ld {
  my $b = shift;
  return +{
    '@type'=>'Product', '@id'=>abs_url("/arenda/$b->{slug}/#product"),
    name=>"Аренда $b->{name} в Нячанге", sku=>$b->{slug}, brand=>{ '@type'=>'Brand', name=>$b->{brand} },
    image=>img_abs($b), description=>$b->{short}, category=>$b->{type},
    offers=>{
      '@type'=>'AggregateOffer', priceCurrency=>'VND', lowPrice=>int($b->{pm}/30), highPrice=>$b->{p1}, offerCount=>3,
      availability=>'https://schema.org/InStock', url=>abs_url("/arenda/$b->{slug}/"),
      seller=>{ '@id'=>abs_url('/#org') },
    },
    additionalProperty=>[
      { '@type'=>'PropertyValue', name=>'Объём двигателя', value=>cc_label($b) },
      { '@type'=>'PropertyValue', name=>'Права', value=>lic_label($b->{license}) },
      { '@type'=>'PropertyValue', name=>'Год', value=>$b->{year} },
    ],
  }
}

# ------------------------------------------------------------ layout
sub nav_items {
  ( ['Без прав', '/arenda-bajka-bez-prav/'], ['Как арендовать', '/kak-arendovat/'],
    ['Доставка', '/dostavka/'], ['Права', '/prava-vo-vetname/'], ['О сервисе', '/o-nas/'], ['FAQ', '/faq/'] )
}

my $CAT_MENU;   # одинаковое на всех страницах — собираем один раз
sub header_html {
  my $path = shift;
  my $nav = join '', map { my $cur = $path eq $_->[1] ? ' aria-current="page"' : ''; qq{<a href="${\ u($_->[1])}"$cur>$_->[0]</a>} } nav_items();
  my $tg = "https://t.me/$SITE{telegram}"; my $wa = "https://wa.me/$SITE{whatsapp}";
  $CAT_MENU //= cat_menu();
  my $all = qq{<a class="hcat__all" href="${\ u('/katalog/')}">Весь каталог — ${\ models(scalar @BIKES)} ${\ icon('arrow')}</a>};
  return <<"H";
<header class="header" data-header>
  <div class="container header__in">
    <a class="logo" href="${\ u('/')}" aria-label="MYBIKE — на главную"><span class="logo__mark">${\ icon('scooter')}</span><span class="logo__text">MYBIKE</span></a>
    <div class="hcat" data-hcat>
      <button class="hcat__btn" type="button" aria-expanded="false" aria-controls="hcat-menu" data-hcat-btn>${\ icon('menu')}<span>Каталог</span></button>
      <div class="hcat__menu" id="hcat-menu"><div class="hcat__box">$CAT_MENU$all</div></div>
    </div>
    <nav class="nav" aria-label="Основное меню" data-nav>
      <details class="nav__cat"><summary>Каталог ${\ icon('chev')}</summary>$CAT_MENU$all</details>
      $nav
      <div class="nav__mobile-cta"><a class="btn btn--orange" href="$tg" rel="nofollow">${\ icon('telegram')} Написать в Telegram</a><a class="btn btn--light" href="tel:$SITE{phone_raw}">${\ icon('phone')} $SITE{phone}</a></div>
    </nav>
    <div class="header__social">
      <a class="round" href="$tg" rel="nofollow" aria-label="Telegram" data-goal="tg">${\ icon('telegram')}</a>
      <a class="round" href="$wa" rel="nofollow" aria-label="WhatsApp" data-goal="wa">${\ icon('whatsapp')}</a>
      <a class="round round--hide-sm" href="$SITE{vk}" rel="nofollow" aria-label="ВКонтакте">${\ icon('vk')}</a>
      <button class="burger" type="button" aria-label="Меню" aria-expanded="false" data-burger>${\ icon('menu')}</button>
    </div>
  </div>
</header>
H
}

sub footer_html {
  my $cats = join '', map { qq{<li><a href="${\ u("/$_->{slug}/")}">$_->{h1}</a></li>} } @CATEGORIES;
  my @pop = sort { $a->{rank} <=> $b->{rank} } @BIKES;
  my $bikes = join '', map { qq{<li><a href="${\ u("/arenda/$_->{slug}/")}">Аренда $_->{name}</a></li>} } @pop;
  my $info = join '', map { qq{<li><a href="${\ u("/$_->{slug}/")}">$_->{nav}</a></li>} } grep { $_->{slug} ne 'politika-konfidencialnosti' } @PAGES;
  my $y = strftime('%Y', localtime);
  return <<"H";
<footer class="footer">
  <div class="container">
    <div class="footer__top">
      <div class="footer__brand">
        <a class="logo logo--light" href="${\ u('/')}"><span class="logo__mark">${\ icon('scooter')}</span><span class="logo__text">MYBIKE</span></a>
        <p>Аренда скутеров и мотоциклов в Нячанге без залога паспорта. Бесплатная доставка в отель с первого дня аренды.</p>
        <div class="footer__contacts">
          <a href="https://t.me/$SITE{telegram}" rel="nofollow">${\ icon('telegram')} Telegram</a>
          <a href="https://wa.me/$SITE{whatsapp}" rel="nofollow">${\ icon('whatsapp')} WhatsApp</a>
          <a href="tel:$SITE{phone_raw}">${\ icon('phone')} $SITE{phone}</a>
          <a href="mailto:$SITE{email}">${\ icon('mail')} $SITE{email}</a>
          <span>${\ icon('pin')} $SITE{address}</span>
          <span>${\ icon('clock')} $SITE{hours}</span>
        </div>
      </div>
      <div><p class="footer__h">Подборки</p><ul>$cats<li><a href="${\ u('/katalog/')}">Весь каталог</a></li></ul></div>
      <div><p class="footer__h">Модели</p><ul class="footer__cols">$bikes</ul></div>
      <div><p class="footer__h">Информация</p><ul>$info<li><a href="${\ u('/faq/')}">Вопросы и ответы</a></li></ul></div>
    </div>
    <div class="footer__bottom"><span>© $SITE{founded}–$y MYBIKE. Аренда байков в Нячанге.</span><a href="${\ u('/politika-konfidencialnosti/')}">Политика конфиденциальности</a></div>
  </div>
</footer>
<div class="mcta" data-mcta>
  <a class="btn btn--orange" href="${\ u('/katalog/')}">Выбрать байк</a>
  <a class="round round--dark" href="https://t.me/$SITE{telegram}" rel="nofollow" aria-label="Telegram" data-goal="tg">${\ icon('telegram')}</a>
  <a class="round round--dark" href="https://wa.me/$SITE{whatsapp}" rel="nofollow" aria-label="WhatsApp" data-goal="wa">${\ icon('whatsapp')}</a>
</div>
H
}

sub booking_modal {
  my @sorted = sort { $a->{p1} <=> $b->{p1} } @BIKES;
  my $opts = join '', map {
    qq{<option value="$_->{slug}" data-p1="$_->{p1}" data-p7="$_->{p7}" data-pm="$_->{pm}">$_->{name} — от ${\ vnd($_->{p7})}/день</option>}
  } @sorted;
  return <<"H";
<div class="modal" id="booking" role="dialog" aria-modal="true" aria-labelledby="booking-title" hidden data-modal>
  <div class="modal__backdrop" data-close></div>
  <form class="modal__box" data-booking-form novalidate>
    <button class="modal__x" type="button" aria-label="Закрыть" data-close>${\ icon('close')}</button>
    <p class="modal__title" id="booking-title">Бронирование байка</p>
    <p class="modal__sub">Без предоплаты. Подтвердим за 5 минут.</p>
    <label class="field"><span>Байк</span><select name="bike" required>$opts</select></label>
    <div class="field-row">
      <label class="field"><span>Получение</span><input type="date" name="from" required></label>
      <label class="field"><span>Возврат</span><input type="date" name="to" required></label>
    </div>
    <label class="field"><span>Куда привезти</span><input type="text" name="place" placeholder="Отель или адрес в Нячанге" autocomplete="street-address"></label>
    <label class="field"><span>Ваше имя</span><input type="text" name="name" placeholder="Как к вам обращаться" autocomplete="given-name"></label>
    <label class="field"><span>Telegram или телефон <small>(необязательно)</small></span><input type="text" name="contact" placeholder="\@username или +7…" autocomplete="tel"></label>
    <div class="modal__total" data-modal-total></div>
    <p class="modal__label">Куда отправить заявку</p>
    <div class="modal__send">
      <button class="btn btn--orange" type="submit" name="via" value="tg" data-goal="book_tg">${\ icon('telegram')} В Telegram</button>
      <button class="btn btn--dark" type="submit" name="via" value="wa" data-goal="book_wa">${\ icon('whatsapp')} В WhatsApp</button>
    </div>
    <p class="modal__note">Откроется чат с готовым текстом заявки — просто нажмите «Отправить».</p>
  </form>
</div>
<div class="toast" data-toast hidden></div>
H
}

sub breadcrumbs_html {
  my @c = @_;
  my @parts;
  for my $i (0..$#c) {
    push @parts, $i == $#c ? qq{<span aria-current="page">$c[$i][0]</span>} : qq{<a href="${\ u($c[$i][1])}">$c[$i][0]</a>};
  }
  '<nav class="crumbs container" aria-label="Хлебные крошки">' . join('<span class="crumbs__sep">/</span>', @parts) . '</nav>';
}

sub verification_meta {
  join "\n", grep { $_ }
    ($SITE{yandex_verification} ? qq{<meta name="yandex-verification" content="${\ esc($SITE{yandex_verification})}">} : ''),
    ($SITE{google_verification} ? qq{<meta name="google-site-verification" content="${\ esc($SITE{google_verification})}">} : '');
}
sub counters_html {
  my $h = '';
  if (($SITE{ym} // '') =~ /^(\d+)$/) {
    $h .= qq{<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym($1,"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/$1" style="position:absolute;left:-9999px" alt=""></div></noscript>\n};
  }
  if (($SITE{ga} // '') =~ /^(G-[A-Z0-9]+)$/) {
    $h .= qq{<script async src="https://www.googletagmanager.com/gtag/js?id=$1"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","$1");</script>\n};
  }
  $h;
}
sub site_js_config {
  my %c = (tg=>$SITE{telegram}, wa=>$SITE{whatsapp}, rub=>$SITE{rub_rate} + 0, base=>$B);
  $c{ym} = $SITE{ym} + 0 if ($SITE{ym} // '') =~ /^\d+$/;
  $c{sb} = { url=>$SITE{sb_url}, key=>$SITE{sb_key} } if $SITE{sb_url} && $SITE{sb_key};
  (my $j = $JSON->encode(\%c)) =~ s{</}{<\\/}g;
  $j;
}

sub page {
  my %a = @_;
  my $path = $a{path};
  my $canon = abs_url($path);
  my @ld = ( org_ld(), { '@type'=>'WebSite', '@id'=>abs_url('/#site'), url=>abs_url('/'), name=>$SITE{name}, inLanguage=>'ru', publisher=>{ '@id'=>abs_url('/#org') } } );
  push @ld, @{ $a{ld} || [] };
  push @ld, crumbs_ld(@{ $a{crumbs} }) if $a{crumbs};
  my $ld = $JSON->encode({ '@context'=>'https://schema.org', '@graph'=>\@ld });
  $ld =~ s{</}{<\\/}g;
  my $robots = ($a{noindex} || $PREVIEW) ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  my $og = abs_url('/assets/img/og.png');
  my $title = esc($a{title}); my $desc = esc($a{desc});
  my $bodyclass = $a{bodyclass} // q{};
  my $crumbs = $a{crumbs} ? breadcrumbs_html(@{ $a{crumbs} }) : '';
  push @SITEMAP, [$path, $a{priority} // '0.7'] unless $a{noindex} || $a{nositemap};
  my $html = <<"H";
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<meta name="description" content="$desc">
<meta name="robots" content="$robots">
<link rel="canonical" href="$canon">
<link rel="alternate" hreflang="ru" href="$canon">
<link rel="alternate" hreflang="x-default" href="$canon">
<meta name="geo.region" content="VN-34">
<meta name="geo.placename" content="Nha Trang">
<meta name="geo.position" content="$SITE{lat};$SITE{lng}">
<meta name="ICBM" content="$SITE{lat}, $SITE{lng}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="MYBIKE">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:url" content="$canon">
<meta property="og:image" content="$og">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FF6B2C">
${\ verification_meta()}
<link rel="icon" href="${\ u('/assets/img/favicon.svg')}" type="image/svg+xml">
<link rel="manifest" href="${\ u('/manifest.webmanifest')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght\@500;600;700&family=Manrope:wght\@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="${\ u('/assets/css/style.css')}?v=$VER">
<script type="application/ld+json">$ld</script>
${\ counters_html()}
</head>
<body class="$bodyclass">
<a class="skip" href="#main">Перейти к содержимому</a>
${\ header_html($path)}
<main id="main">
$crumbs
$a{body}
</main>
${\ footer_html()}
${\ booking_modal()}
<script>window.MYBIKE=${\ site_js_config()};</script>
<script src="${\ u('/assets/js/app.js')}?v=$VER" defer></script>
</body>
</html>
H
  write_file($path, $html);
}

# ------------------------------------------------------------ components
# три цены по сроку: активная ступень подсвечена, по клику ставит её срок; скидка — к цене 1–6 дней
sub price_tiers {
  my ($b, $d) = @_;
  my $cur = $d >= 30 ? 30 : $d >= 7 ? 7 : 1;
  join '', map {
    my ($from, $label) = @$_;
    my $p = rate($b, $from); my $off = int((1 - $p / $b->{p1}) * 100 + 0.5);
    qq{<button type="button" class="ptier${\ ($from == $cur ? ' is-on' : '')}" data-set-days="$from"><span>$label</span><b>${\ vnd(r100($p))}</b>${\ ($off > 0 ? "<i>−$off%</i>" : '')}</button>}
  } [1, '1–6 дней'], [7, 'от 7 дней'], [30, 'от 30 дней'];
}

sub bike_card {
  my ($b, %o) = @_;
  $o{sfx} //= q{};
  my $url = u("/arenda/$b->{slug}/");
  my $days = $CARD_DAYS;
  my $tot = cost($b, $days);
  my $lic = $b->{license};
  my $licbadge = $lic eq 'none' ? '<span class="badge badge--green">Без прав</span>' : '';
  my $hit = ($b->{popular} && $b->{rank} <= 2) ? '<span class="badge badge--orange">Хит</span>' : '';
  # три главные характеристики: ABS (или коробка), для двоих, права
  (my $gear = $b->{gearbox} // '') =~ s/[\s,(].*//;
  my @feats = (
    $b->{abs} ? ['ABS'] : $gear ? [$gear] : (),
    ($b->{seats} // 0) >= 2 ? ['Для двоих'] : (),
    [$lic eq 'none' ? 'Без прав' : "Права $lic", "lic--$lic"],
  );
  my $feats = join '', map { qq{<li${\ ($_->[1] ? qq{ class="$_->[1]"} : '')}>$_->[0]</li>} } @feats;
  my $h = $o{h} // 'h3';
  my $alt = esc("$b->{name} — аренда в Нячанге");
  my $dw = plural($days, 'день', 'дня', 'дней');
  my ($dword) = $dw =~ /\x{a0}(.+)/;
  return <<"H";
<article class="bike" data-bike data-group="$b->{group}" data-license="$lic" data-p1="$b->{p1}" data-p7="$b->{p7}" data-pm="$b->{pm}" data-cc="$b->{cc}" data-rank="$b->{rank}" data-name="${\ esc($b->{name})}" data-slug="$b->{slug}" data-days="$days">
  <a class="bike__img" href="$url" tabindex="-1" aria-hidden="true"><img src="${\ img_url($b)}" alt="$alt" width="540" height="423" loading="lazy" decoding="async"><span class="bike__badges">$licbadge$hit</span></a>
  <div class="bike__body">
    <$h class="bike__name"><a href="$url">$b->{name}</a></$h>
    <p class="bike__meta">$b->{type} · ${\ cc_label($b)} · $b->{year}</p>
    <ul class="bike__feats">$feats</ul>
    <div class="bike__term"><span>Срок аренды</span><div class="stepper"><button type="button" data-step="-1" aria-label="Меньше дней">−</button><label class="stepper__val"><input type="number" inputmode="numeric" min="1" max="$MAX_DAYS" value="$days" style="width:${\ length($days)}ch" data-days-input aria-label="Срок аренды, дней"><span data-days-word>$dword</span></label><button type="button" data-step="1" aria-label="Больше дней">+</button></div></div>
    <div class="bike__price"><b data-perday>${\ vnd(r100(rate($b, $days)))}</b><span>/ день</span></div>
    <div class="ptiers" role="group" aria-label="Цена за день по сроку">${\ price_tiers($b, $days)}</div>
    <div class="bike__sum"><span><span data-sum-label>Итого за $dw</span><small data-rub>${\ rub($tot)}</small></span><b data-total>${\ vnd($tot)}</b></div>
    <button class="btn btn--orange btn--block bike__book" type="button" data-book="$b->{slug}" data-goal="book_open">Забронировать</button>
  </div>
</article>
H
}

sub catalog_block {
  my (%o) = @_;
  $o{sfx} //= q{};
  my @bikes = @{ $o{bikes} };
  my $cards = join '', map { bike_card($_, h=>$o{h}, sfx=>$o{sfx} // '') } @bikes;
  my $full = $o{full};
  my $controls = '';
  if ($full) {
    my %cnt; $cnt{$_->{group}}++ for @bikes;
    my $chips = qq{<button type="button" class="chip is-active" data-group-btn="all">Все <i>${\ scalar @bikes}</i></button>}
      . join '', map { qq{<button type="button" class="chip" data-group-btn="$_">$GROUP{$_}[0] <i>$cnt{$_}</i></button>} } grep { $cnt{$_} } @GROUP_ORDER;
    $controls = <<"H";
<div class="filters" data-filters>
  <div class="filters__row">
    <div class="seg" role="group" aria-label="Права категории A">
      <span class="seg__label">Права категории A:</span>
      <button type="button" class="seg__btn is-active" data-lic-btn="all">Не важно</button>
      <button type="button" class="seg__btn" data-lic-btn="none">Нет прав</button>
      <button type="button" class="seg__btn" data-lic-btn="yes">Есть права</button>
    </div>
    <label class="sort">Сортировка
      <select data-sort><option value="rank">Популярные</option><option value="cheap">Сначала дешевле</option><option value="exp">Сначала дороже</option><option value="cc">По мощности</option></select>
    </label>
  </div>
  <div class="chips" role="group" aria-label="Класс байка">$chips</div>
  <div class="filters__days">
    <label for="days-all$o{sfx}">${\ icon('calendar')} Срок аренды для всех байков: <output data-days-all>${\ plural($CARD_DAYS, 'день', 'дня', 'дней')}</output></label>
    <input id="days-all$o{sfx}" type="range" min="1" max="60" value="$CARD_DAYS" data-range-all>
  </div>
</div>
H
  } else {
    $controls = <<"H";
<div class="filters filters--compact" data-filters>
  <div class="filters__days">
    <label for="days-all$o{sfx}">${\ icon('calendar')} Срок аренды: <output data-days-all>${\ plural($CARD_DAYS, 'день', 'дня', 'дней')}</output></label>
    <input id="days-all$o{sfx}" type="range" min="1" max="60" value="$CARD_DAYS" data-range-all>
  </div>
  <label class="sort">Сортировка
    <select data-sort><option value="rank">Популярные</option><option value="cheap">Сначала дешевле</option><option value="exp">Сначала дороже</option><option value="cc">По мощности</option></select>
  </label>
</div>
H
  }
  return <<"H";
<div class="catalog" data-catalog>
$controls
<div class="grid" data-grid>$cards</div>
<div class="empty" data-empty hidden><p>Под эти условия байков нет. Без прав категории A доступны только <a href="${\ u('/arenda-bajka-bez-prav/')}">мопеды 50 см³ и электроскутеры</a>.</p><button class="btn btn--dark" type="button" data-reset>Сбросить фильтры</button></div>
</div>
H
}

sub plural { my ($n, @f) = @_; my $m = $n % 100; my $d = $n % 10; "$n\x{a0}" . $f[ $m >= 11 && $m <= 14 ? 2 : $d == 1 ? 0 : $d >= 2 && $d <= 4 ? 1 : 2 ] }
sub models { plural(shift, 'модель', 'модели', 'моделей') }

# список для плиток и меню «Каталог»: «Все байки» + непустые подборки → { url, title, sub, bikes, top }
sub cat_list {
  my $all_url = shift // u('/katalog/');
  my @l = ({ url=>$all_url, title=>'Все байки', sub=>'Весь парк', bikes=>[@BIKES] },
    map { my @m = filter_bikes($_->{filter}); @m ? { url=>u("/$_->{slug}/"), title=>$_->{chip}, sub=>$_->{short}, bikes=>\@m } : () } @CATEGORIES);
  $_->{top} = (sort { $a->{rank} <=> $b->{rank} || $a->{p1} <=> $b->{p1} } @{ $_->{bikes} })[0] for @l;
  @l;
}

# плитка категории: счётчик, фото самого популярного байка, название; при наведении — фирменный цвет
sub cat_tile {
  my $c = shift; my @m = @{ $c->{bikes} };
  return qq{<a class="tile" href="$c->{url}"><span class="tile__n">${\ models(scalar @m)}</span><span class="tile__img"><img src="${\ img_url($c->{top})}" alt="${\ esc($c->{top}{name})}" width="540" height="423" loading="lazy" decoding="async"></span><span class="tile__t">$c->{title}</span><span class="tile__s">$c->{sub}</span><span class="tile__p">от\x{a0}${\ vnd(min_p(@m))} в день</span></a>};
}

sub cat_tiles {
  my $cur = shift // '';
  # на странице каталога «Все байки» ведёт к списку моделей ниже
  qq{<div class="tiles">${\ join '', map { cat_tile($_) } cat_list($cur eq 'katalog' ? '#models' : undef)}</div>};
}

# выпадающее меню кнопки «Каталог» в шапке: только подборки — «Все байки» здесь кнопка внизу меню
sub cat_menu {
  my (undef, @cats) = cat_list();
  my $items = join '', map {
    my @m = @{ $_->{bikes} };
    qq{<li><a class="hcat__item" href="$_->{url}"><b>$_->{title}</b><small>${\ models(scalar @m)}</small></a></li>}
  } @cats;
  return qq{<ul class="hcat__list">$items</ul>};
}

# «Популярные модели»: горизонтальная лента карточек со стрелками
sub popular_block {
  my @all = @_;
  my @b = grep { $_->{popular} } @all;
  @b = @all[0 .. ($#all < 7 ? $#all : 7)] if @b < 4;
  my $cards = join '', map { bike_card($_, h=>'h3') } @b;
  return (<<"H", @b);
<div class="rail" data-rail>
  <div class="head"><h2 class="h2">Популярные модели</h2><div class="rail__nav"><button class="rail__btn rail__btn--prev" type="button" data-rail-prev aria-label="Предыдущие модели">${\ icon('arrow')}</button><button class="rail__btn" type="button" data-rail-next aria-label="Следующие модели">${\ icon('arrow')}</button></div></div>
  <div class="rail__track" data-rail-track>$cards</div>
  <div class="rail__more"><a class="btn btn--dark btn--lg" href="${\ u('/katalog/')}">Весь каталог — ${\ models(scalar @all)} ${\ icon('arrow')}</a></div>
</div>
H
}

sub filter_bikes {
  my $f = shift;
  my @b = @BIKES;
  @b = grep { $_->{license} eq $f->{license} } @b if $f->{license};
  if ($f->{groups}) { my %g = map { $_ => 1 } @{ $f->{groups} }; @b = grep { $g{$_->{group}} } @b }
  @b = grep { $_->{p1} <= $f->{maxp1} } @b if $f->{maxp1};
  @b = grep { $_->{abs} } @b if $f->{abs};
  @b = ($f->{sort} // '') eq 'pm' ? sort { $a->{pm} <=> $b->{pm} } @b : sort { $a->{rank} <=> $b->{rank} || $a->{p1} <=> $b->{p1} } @b;
  @b;
}

sub price_table {
  my @b = @_;
  my $rows = join '', map {
    qq{<tr><td><a href="${\ u("/arenda/$_->{slug}/")}">$_->{name}</a><small>${\ cc_label($_)} · ${\ lic_label($_->{license})}</small></td><td>${\ vnd($_->{p1})}</td><td>${\ vnd($_->{p7})}</td><td><b>${\ vnd($_->{pm})}</b></td></tr>}
  } @b;
  qq{<div class="table-wrap"><table class="table table--price"><thead><tr><th>Модель</th><th>1–6 дней, за день</th><th>7–29 дней, за день</th><th>30 дней</th></tr></thead><tbody>$rows</tbody></table></div>};
}

sub faq_html {
  my @f = @_;
  my $items = join '', map { qq{<details class="faq__item"><summary>${\ esc($_->[0])}<span>${\ icon('chev')}</span></summary><div class="faq__a">${\ fill($_->[1])}</div></details>} } @f;
  qq{<div class="faq">$items</div>};
}

# иллюстрация под текстом карточки преимущества (по ключу иконки): элементы интерфейса или SVG-рисунок
sub inc_art {
  my $k = shift;
  my $ic = sub { my ($n, $pos) = @_; qq{<span class="art-ic art-ic--${\ ($pos // 'r')}">${\ icon($n)}</span>} };
  my $msg = sub { my ($t, $me) = @_; qq{<span class="art-msg${\ ($me ? ' art-msg--me' : '')}">$t</span>} };
  my %art = (
    # паспорт остаётся у клиента: обложка, фото для договора и отметка
    passport => sub { q{<svg class="art-svg" viewBox="0 0 260 170">
<g transform="rotate(-8 105 90)"><rect x="48" y="14" width="114" height="150" rx="12" fill="#2B2B2B"/><rect x="56" y="22" width="98" height="134" rx="8" fill="none" stroke="#FF6B2C" stroke-opacity=".45" stroke-width="1.5"/><circle cx="105" cy="72" r="22" fill="none" stroke="#FF6B2C" stroke-width="3"/><ellipse cx="105" cy="72" rx="10" ry="22" fill="none" stroke="#FF6B2C" stroke-width="2.5"/><path d="M83 72h44" stroke="#FF6B2C" stroke-width="2.5"/><text x="105" y="124" text-anchor="middle" fill="#fff" font-size="12" font-weight="800" letter-spacing="3">ПАСПОРТ</text></g>
<g transform="rotate(6 204 50)"><rect x="160" y="16" width="88" height="66" rx="12" class="art-svg__bg"/><rect x="168" y="24" width="34" height="50" rx="6" fill="#FFF1EA"/><circle cx="185" cy="42" r="7" fill="#FF6B2C"/><path d="M174 66c2-6 6-9 11-9s9 3 11 9z" fill="#FF6B2C"/><rect x="208" y="32" width="32" height="5" rx="2.5" fill="#E6E6E6"/><rect x="208" y="43" width="24" height="5" rx="2.5" fill="#E6E6E6"/><rect x="208" y="54" width="28" height="5" rx="2.5" fill="#E6E6E6"/></g>
<rect x="112" y="120" width="140" height="38" rx="19" class="art-svg__bg"/><circle cx="132" cy="139" r="10" fill="#1F9D55"/><path d="m127 139 3.5 3.5 6.5-7" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="149" y="143.5" font-size="12.5" font-weight="800" fill="#1E1E1E">Остаётся у вас</text>
</svg>} },
    # доставка: карта с маршрутом от байка до отеля
    truck    => sub { q{<svg class="art-svg" viewBox="0 0 260 170">
<rect x="4" y="4" width="252" height="162" rx="22" class="art-svg__bg"/><path d="M226 4h30v162h-40q16-40 6-78t4-84z" fill="#DCEBFA"/>
<g stroke="#EFEFEF" stroke-linecap="round" fill="none"><path d="M12 60h200M12 128h200M78 12v146M188 12v146" stroke-width="12"/><path d="M118 158 214 50" stroke-width="8"/></g>
<path d="M44 128h34V78q0-18 18-18h92V46" fill="none" stroke="#FF6B2C" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>
<circle cx="44" cy="128" r="18" fill="#FF6B2C"/><svg x="32" y="116" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h7.5l2.5-7h-3M14 5h2.5l1.5 5.5M5.5 15l2-4H13"/></svg>
<path d="M188 46s-16-14-16-26a16 16 0 0 1 32 0c0 12-16 26-16 26z" fill="#1E1E1E"/><circle cx="188" cy="20" r="6" fill="#fff"/>
<rect x="92" y="10" width="74" height="24" rx="12" fill="#1E1E1E"/><text x="129" y="26" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">Ваш отель</text>
<rect x="16" y="76" width="50" height="24" rx="12" fill="#FF6B2C"/><text x="41" y="92" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff">0 ₫</text>
</svg>} },
    # шлемы: взрослые M и L и детский
    helmet   => sub { q{<svg class="art-svg" viewBox="0 0 260 160">
<defs><g id="art-hm"><path d="M8 70C4 34 30 8 62 8c30 0 46 24 46 50v12q0 8-8 8H16q-7 0-8-8z"/><path d="M10 66h98v6q0 6-8 6H16q-6 0-6-6z" fill="#000" fill-opacity=".18"/><path d="M56 34h48q3 0 3.5 6l.5 18q0 4-4 4H58q-10 0-10-14t8-14z" fill="#2A2F36"/><path d="M62 40h34" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/><path d="M16 54Q26 22 60 16" stroke="#fff" stroke-opacity=".45" stroke-width="5" fill="none" stroke-linecap="round"/></g></defs>
<use href="#art-hm" fill="#333" transform="translate(120 10) scale(1.12)"/>
<use href="#art-hm" fill="#FF6B2C" transform="translate(12 42) scale(1.12)"/>
<use href="#art-hm" fill="#FFB792" transform="translate(166 92) scale(.55)"/>
<g font-size="12" font-weight="800" text-anchor="middle"><circle cx="38" cy="56" r="13" class="art-svg__bg"/><text x="38" y="60.5" fill="#1E1E1E">M</text><circle cx="234" cy="18" r="13" class="art-svg__bg"/><text x="234" y="22.5" fill="#1E1E1E">L</text></g>
<rect x="155" y="136" width="90" height="22" rx="11" fill="#1E1E1E"/><text x="200" y="151" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">Детский · 0 ₫</text>
</svg>} },
    # держатель с телефоном на руле и капли дождя
    rain     => sub { q{<svg class="art-svg" viewBox="0 0 260 170">
<g fill="#BFD9F5"><path d="M30 14c5 7 7 11 7 14a7 7 0 0 1-14 0c0-3 2-7 7-14z"/><path d="M62 58c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M26 96c5 7 7 11 7 14a7 7 0 0 1-14 0c0-3 2-7 7-14z"/><path d="M222 20c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z"/><path d="M200 60c5 7 7 11 7 14a7 7 0 0 1-14 0c0-3 2-7 7-14z"/></g>
<path d="M18 152h224" stroke="#333" stroke-width="10" stroke-linecap="round"/><path d="M14 152h30M216 152h30" stroke="#1E1E1E" stroke-width="15" stroke-linecap="round"/>
<rect x="116" y="134" width="28" height="24" rx="6" fill="#555"/><path d="M101 44h-6v82h6M159 44h6v82h-6" stroke="#555" stroke-width="5" fill="none" stroke-linejoin="round"/>
<rect x="96" y="12" width="68" height="126" rx="13" fill="#1E1E1E"/><rect x="101" y="18" width="58" height="114" rx="9" fill="#FFF1EA"/>
<path d="M101 60h58M101 100h58M126 18v114" stroke="#fff" stroke-width="5"/><path d="M114 120v-20h26V60h10V36" fill="none" stroke="#FF6B2C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="150" cy="34" r="5" fill="#1E1E1E"/><circle cx="114" cy="120" r="5.5" fill="#FF6B2C" stroke="#fff" stroke-width="2"/>
<rect x="150" y="99" width="108" height="26" rx="13" class="art-svg__bg"/><path d="M164 106c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#7FB4EA"/><text x="174" y="116.5" font-size="11.5" font-weight="800" fill="#1E1E1E">2 дождевика</text>
</svg>} },
    wrench   => sub { $msg->('Пробил колесо у Хон Чонг 😩') . $msg->('Не переживайте, уже везём замену 🛵', 1) . $ic->('wrench') },
    chat     => sub { $msg->('Куда съездить в выходные?') . $msg->('Ба Хо или Зоклет — скинули маршрут и заправки 👌', 1) . $ic->('chat') },
    # оплата: купюра в донгах, карты в рублях и долларах, монета USDT
    card     => sub { q{<svg class="art-svg" viewBox="0 0 260 160">
<g transform="rotate(-12 80 70)"><rect x="18" y="34" width="130" height="70" rx="10" fill="#DFF3E7"/><rect x="26" y="42" width="114" height="54" rx="6" fill="none" stroke="#1F9D55" stroke-opacity=".35" stroke-width="1.5"/><circle cx="83" cy="69" r="16" fill="none" stroke="#1F9D55" stroke-opacity=".5" stroke-width="2"/><text x="83" y="75" text-anchor="middle" font-size="17" font-weight="800" fill="#1F9D55">₫</text></g>
<g transform="rotate(8 174 62)"><rect x="104" y="18" width="140" height="88" rx="14" fill="#333"/><rect x="104" y="36" width="140" height="14" fill="#1E1E1E"/><text x="230" y="94" text-anchor="end" font-size="18" font-weight="800" fill="#fff">$</text></g>
<g transform="rotate(-3 128 108)"><rect x="54" y="62" width="150" height="92" rx="14" fill="#FF6B2C"/><rect x="70" y="82" width="28" height="21" rx="4" fill="#FFD9B8"/><path d="M70 92.5h28M84 82v21" stroke="#E2551A" stroke-width="1"/><text x="70" y="140" font-size="13" font-weight="700" fill="#fff" letter-spacing="1.5">•••• 2468</text><text x="190" y="106" text-anchor="end" font-size="28" font-weight="800" fill="#fff">₽</text></g>
<circle cx="216" cy="128" r="24" fill="#26A17B"/><circle cx="216" cy="128" r="19" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><text x="216" y="131.5" text-anchor="middle" font-size="10.5" font-weight="800" fill="#fff">USDT</text>
</svg>} },
    coin     => sub {
      my ($b) = sort { $a->{rank} <=> $b->{rank} || $a->{p1} <=> $b->{p1} } @BIKES;
      my $off = int((1 - $b->{p7} / $b->{p1}) * 100 + 0.5);
      qq{<span class="art-card art-r1"><b class="art-card__h">$b->{name}</b><span class="art-tier"><span>1–6 дней</span><b>${\ vnd($b->{p1})}</b></span><span class="art-tier art-tier--hl"><span>7–29 дней <i>−$off%</i></span><b>${\ vnd($b->{p7})}</b></span><span class="art-tier"><span>30 дней</span><b>${\ vnd($b->{pm} / 30)}</b></span></span>} . $ic->('coin')
    },
  );
  return $art{$k} ? $art{$k}->() : $ic->($k, 'c');
}

sub included_html {
  my $items = join '', map { (my $t = $_->[2]) =~ s/\.\s*$//; qq{<li class="inc"><b class="inc__t">$_->[1]</b><p>$t</p><div class="inc__art inc__art--$_->[0]" aria-hidden="true">${\ inc_art($_->[0])}</div></li>} } @INCLUDED;
  qq{<ul class="incs">$items</ul>};
}

sub compare_html {
  my $rows = join '', map { qq{<tr><td>$_->[0]</td><td class="yes">${\ icon('check')} $_->[1]</td><td class="no">$_->[2]</td></tr>} } @COMPARE;
  qq{<div class="table-wrap"><table class="table table--cmp"><thead><tr><th></th><th>MYBIKE</th><th>Обычный прокат</th></tr></thead><tbody>$rows</tbody></table></div>};
}

sub steps_html {
  my $i = 0;
  my $items = join '', map { $i++; my $cls = $i == @STEPS ? ' step--orange' : ''; qq{<li class="step$cls"><span class="step__n">0$i</span><b>$_->[0]</b><p>$_->[1]</p></li>} } @STEPS;
  qq{<ol class="steps">$items</ol>};
}

sub cta_block {
  my ($title, $text) = @_;
  $title //= 'Не знаете, какой байк выбрать?';
  $text  //= 'Напишите нам — подберём байк под ваши права, маршруты и бюджет за 5 минут.';
  return <<"H";
<section class="section"><div class="container"><div class="cta">
  <div><h2 class="cta__t">$title</h2><p>$text</p></div>
  <div class="cta__btns">
    <a class="btn btn--light" href="https://t.me/$SITE{telegram}" rel="nofollow" data-goal="tg">${\ icon('telegram')} Telegram</a>
    <a class="btn btn--dark" href="https://wa.me/$SITE{whatsapp}" rel="nofollow" data-goal="wa">${\ icon('whatsapp')} WhatsApp</a>
  </div>
</div></div></section>
H
}

sub delivery_table {
  my $rows = join '', map { qq{<tr><td>$_->[0]</td><td><b>$_->[1]</b></td><td>$_->[2]</td></tr>} } @DELIVERY;
  qq{<div class="table-wrap"><table class="table"><thead><tr><th>Куда</th><th>Стоимость</th><th>Время</th></tr></thead><tbody>$rows</tbody></table></div>};
}

sub trust_chips {
  qq{<ul class="trust">}
  . join('', map { qq{<li>${\ icon('check')} $_</li>} } 'Без залога паспорта', 'Бесплатная доставка', '2 шлема в комплекте', 'Оплата при получении')
  . '</ul>';
}

# ------------------------------------------------------------ pages
sub build_home {
  my @all = sort { $a->{rank} <=> $b->{rank} || $a->{p1} <=> $b->{p1} } @BIKES;
  my ($popular, @pop) = popular_block(@all);
  my $types = join '', map { qq{<option value="$_">$GROUP{$_}[0]</option>} } @GROUP_ORDER;
  my $reviews = join '', map { qq{<figure class="review"><div class="review__stars">${\ join '', map { icon('star') } 1..5}</div><blockquote>$_->[2]</blockquote><figcaption><b>$_->[0]</b><span>$_->[1]</span></figcaption></figure>} } @REVIEWS;
  my $body = <<"H";
<section class="hero">
  <div class="container hero__in">
    <div class="hero__text">
      <h1 class="hero__h1">Аренда скутеров<br>и мотоциклов в Нячанге</h1>
      <p class="hero__sub">${\ scalar @BIKES} моделей от 100${\ "\x{a0}"}000${\ "\x{a0}"}₫ в день — от мопедов без прав до макси-скутеров. Привезём к отелю бесплатно — от 30 минут.</p>
      ${\ trust_chips()}
      <div class="hero__btns">
        <a class="btn btn--orange btn--lg" href="#catalog">Выбрать байк</a>
        <a class="btn btn--light btn--lg" href="https://t.me/$SITE{telegram}" rel="nofollow" data-goal="tg">Связаться</a>
      </div>
    </div>
    <div class="hero__media"><img src="${\ u('/assets/img/bikes/placeholder.png')}" alt="Скутер в аренду в Нячанге" width="540" height="423" fetchpriority="high"></div>
  </div>
  <div class="container">
    <form class="search" action="${\ u('/katalog/')}" method="get" data-search>
      <label class="search__f"><span>Получение</span><span class="search__v">${\ icon('calendar')}<input type="date" name="from" data-from aria-label="Дата получения"></span></label>
      <label class="search__f"><span>Возврат</span><span class="search__v">${\ icon('calendar')}<input type="date" name="to" data-to aria-label="Дата возврата"></span></label>
      <label class="search__f search__f--wide"><span>Тип байка</span><span class="search__v"><select name="type" aria-label="Тип байка"><option value="all">Любой</option><option value="nolicense">Без прав (50cc и электро)</option>$types</select></span></label>
      <button class="btn btn--dark btn--lg search__btn" type="submit">Найти байк ${\ icon('search')}</button>
    </form>
  </div>
</section>

<section class="section section--tight">
  <div class="container">
    <div class="head"><h2 class="h2">Выберите свой<br>идеальный байк</h2><p class="head__p">Скутеры и мотоциклы для любых поездок по Нячангу — от лёгких городских моделей до мощных байков для путешествий.</p></div>
    ${\ cat_tiles()}
  </div>
</section>

<section class="section section--grey" id="catalog">
  <div class="container">
    $popular
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="head"><h2 class="h2">Всё включено.<br>Без доплат.</h2><p class="head__p">Мы изучили все прокаты Нячанга и собрали лучшие условия рынка в одном месте.</p></div>
    ${\ included_html()}
  </div>
</section>

<section class="section section--grey">
  <div class="container split">
    <div>
      <h2 class="h2">MYBIKE против<br>обычного проката</h2>
      <p class="lead">Сравнили условия с открытых сайтов прокатов Нячанга. Если где-то найдёте условия лучше — напишите нам, и мы сделаем так же.</p>
      <a class="btn btn--orange" href="#catalog">Выбрать байк</a>
    </div>
    ${\ compare_html()}
  </div>
</section>

<section class="section">
  <div class="container steps-wrap">
    <div class="steps-wrap__media"><h2 class="h2">Арендуйте байк<br>за несколько<br>простых шагов</h2><img src="${\ u('/assets/img/bikes/placeholder.png')}" alt="Байк MYBIKE" width="540" height="423" loading="lazy"></div>
    ${\ steps_html()}
  </div>
</section>

<section class="section section--grey">
  <div class="container why">
    <div class="why__photo"><img src="${\ u('/assets/img/bikes/placeholder.png')}" alt="Парк байков MYBIKE в Нячанге" width="540" height="423" loading="lazy"></div>
    <div class="why__text">
      <h2 class="h2">Почему выбирают <span class="accent">MYBIKE</span></h2>
      <p>Мы делаем аренду байка такой же простой, как заказ такси. Свой парк из $SITE{fleet_size} байков 2023–2025 годов, собственный сервис и команда, которая говорит по-русски и отвечает за 5 минут.</p>
      <p>Мы не выдаём байки от 110 см³ без прав: это ваша безопасность и рабочая страховка. Зато для тех, у кого прав нет, держим отдельный парк мопедов 50 см³ и электроскутеров.</p>
      <div class="stats"><div><b>$SITE{fleet_size}</b><span>байков в парке</span></div><div><b>$SITE{clients}</b><span>клиентов</span></div><div><b>5 мин</b><span>время ответа</span></div></div>
      <a class="btn btn--orange" href="#catalog">Выбрать байк</a>
    </div>
  </div>
</section>

<section class="section section--dark">
  <div class="container">
    <div class="head head--light"><h2 class="h2">Истории поездок<br>с MYBIKE</h2><p class="head__p">Отзывы наших клиентов из Telegram и Google Maps.</p></div>
    <div class="reviews">$reviews</div>
  </div>
</section>

<section class="section">
  <div class="container faq-wrap">
    <div><h2 class="h2">Частые вопросы</h2><p class="lead">Не нашли ответ? Напишите в <a href="https://t.me/$SITE{telegram}" rel="nofollow">Telegram</a>, ответим за 5 минут.</p><a class="btn btn--dark" href="${\ u('/faq/')}">Все вопросы</a></div>
    ${\ faq_html(@FAQ_MAIN)}
  </div>
</section>
${\ cta_block()}
H
  page(
    path=>'/', priority=>'1.0', bodyclass=>'home',
    title=>'Аренда байков в Нячанге — скутеры от 100 000 ₫, доставка бесплатно | MYBIKE',
    desc=>'Аренда скутеров и мотоциклов в Нячанге: ' . scalar(@BIKES) . ' моделей, есть байки без прав (50cc). Без залога паспорта, бесплатная доставка в отель, 2 шлема в комплекте. Цены от 100 000 ₫.',
    body=>$body, ld=>[ faq_ld(@FAQ_MAIN), itemlist_ld('Популярные байки в аренду в Нячанге', @pop) ],
  );
}

sub itemlist_ld {
  my ($name, @b) = @_; my $i = 0;
  return +{ '@type'=>'ItemList', name=>$name, numberOfItems=>scalar @b,
    itemListElement=>[ map { +{ '@type'=>'ListItem', position=>++$i, url=>abs_url("/arenda/$_->{slug}/"), name=>$_->{name} } } @b ] }
}

sub build_catalog {
  my @all = sort { $a->{rank} <=> $b->{rank} || $a->{p1} <=> $b->{p1} } @BIKES;
  my $body = <<"H";
<section class="section section--top">
  <div class="container">
    <h1 class="h1">Каталог байков в аренду в Нячанге</h1>
    <p class="lead">${\ scalar @BIKES} моделей: мопеды без прав, скутеры 110–160 см³, макси-скутеры, мотоциклы и электроскутеры. Фильтруйте по правам и мощности — цена за ваш срок считается сразу.</p>
    ${\ cat_tiles('katalog')}
  </div>
</section>
<section class="section section--grey section--tight" id="models"><div class="container">${\ catalog_block(bikes=>\@all, full=>1, h=>'h2')}</div></section>
<section class="section"><div class="container"><h2 class="h2">Цены на аренду байков в Нячанге</h2><p class="lead">Цены в донгах. 1 ₽ ≈ $SITE{rub_rate} ₫. Доставка, шлемы и дождевики включены.</p>${\ price_table(sort { $a->{p1} <=> $b->{p1} } @BIKES)}</div></section>
${\ cta_block()}
H
  page(path=>'/katalog/', priority=>'0.9', bodyclass=>'catalog-page',
    title=>'Каталог байков в аренду в Нячанге — цены на все модели | MYBIKE',
    desc=>'Все байки в аренду в Нячанге с ценами: Honda PCX, Vision, Air Blade, Yamaha NVX, XMAX, мопеды 50cc без прав и электроскутеры. Фильтр по правам и мощности.',
    crumbs=>[['Главная','/'],['Каталог','/katalog/']], body=>$body,
    ld=>[ itemlist_ld('Каталог байков MYBIKE', @all) ]);
}

sub build_category {
  my $c = shift;
  my @b = filter_bikes($c->{filter});
  my $sections = join '', map { qq{<h2>$_->[0]</h2>${\ fill($_->[1])}} } @{ $c->{sections} };
  my $others = join '', map { qq{<a class="chip chip--link" href="${\ u("/$_->{slug}/")}">$_->{chip}</a>} } grep { $_->{slug} ne $c->{slug} } @CATEGORIES;
  my $minp = min_p(@b);
  my $body = <<"H";
<section class="section section--top">
  <div class="container">
    <h1 class="h1">$c->{h1}</h1>
    <p class="lead">${\ fill($c->{lead})}</p>
    <ul class="facts"><li><b>${\ scalar @b}</b><span>моделей</span></li><li><b>от ${\ vnd($minp)}</b><span>в день</span></li><li><b>0 ₫</b><span>доставка</span></li></ul>
    <div class="chips chips--links">$others</div>
  </div>
</section>
<section class="section section--grey section--tight"><div class="container">${\ catalog_block(bikes=>\@b, full=>0, h=>'h2')}</div></section>
<section class="section"><div class="container"><h2 class="h2">Цены: ${\ lc_first($c->{h1})}</h2>${\ price_table(@b)}</div></section>
<section class="section section--grey"><div class="container"><h2 class="h2">Что входит в аренду</h2>${\ included_html()}</div></section>
<section class="section"><div class="container text">$sections</div></section>
<section class="section section--grey"><div class="container faq-wrap"><div><h2 class="h2">Вопросы и ответы</h2></div>${\ faq_html(@{ $c->{faq} })}</div></section>
${\ cta_block()}
H
  page(path=>"/$c->{slug}/", priority=>'0.9', bodyclass=>'cat-page', title=>$c->{title}, desc=>$c->{desc},
    crumbs=>[['Главная','/'],['Каталог','/katalog/'],[$c->{h1}, "/$c->{slug}/"]], body=>$body,
    ld=>[ faq_ld(@{ $c->{faq} }), itemlist_ld($c->{h1}, @b),
          { '@type'=>'OfferCatalog', name=>$c->{h1}, itemListElement=>[ map { +{ '@type'=>'Offer', price=>$_->{p7}, priceCurrency=>'VND', itemOffered=>{ '@id'=>abs_url("/arenda/$_->{slug}/#product") } } } @b ] } ]);
}
sub lc_first { my $s = shift; lcfirst $s }

sub build_bike {
  my $b = shift;
  my @faq = (
    ["Нужны ли права для аренды $b->{name}?", lic_text($b) . ($b->{license} ne 'none' ? ' Нет прав? Посмотрите <a href="{base}/arenda-bajka-bez-prav/">байки без прав</a>.' : '')],
    ["Сколько стоит аренда $b->{name} в Нячанге?", "При аренде на 1–6 дней — " . vnd($b->{p1}) . " в день, на 7–29 дней — " . vnd($b->{p7}) . " в день, на месяц — " . vnd($b->{pm}) . ". Доставка, 2 шлема и дождевики включены."],
    ["Нужно ли оставлять паспорт в залог за $b->{name}?", 'Нет. Паспорт остаётся у вас — для договора нужно только фото паспорта со штампом о въезде.'],
    ["Можно ли ездить на $b->{name} вдвоём?", $b->{seats} >= 2 ? "Да, $b->{name} двухместный, в комплекте два шлема." : 'Нет, байк одноместный.'],
    ["Какой расход топлива у $b->{name}?", $b->{cc} ? "Около $b->{fuel}, бак $b->{tank}." : "$b->{fuel}. Зарядное устройство выдаём вместе с байком, зарядка от обычной розетки."],
  );
  my %spec = (
    'Тип'=>$b->{type}, 'Объём двигателя'=>cc_label($b), 'Мощность'=>$b->{power}, 'Год выпуска'=>$b->{year},
    'Коробка'=>$b->{gearbox}, 'Макс. скорость'=>"$b->{speed} км/ч", 'Бак / батарея'=>$b->{tank}, 'Расход / запас хода'=>$b->{fuel},
    'Вес'=>$b->{weight}, 'Мест'=>$b->{seats}, 'Багажник'=>$b->{trunk}, 'ABS'=>($b->{abs} ? 'Есть' : 'Нет'), 'Права'=>lic_label($b->{license}),
  );
  my @order = ('Тип','Объём двигателя','Мощность','Год выпуска','Коробка','Макс. скорость','Бак / батарея','Расход / запас хода','Вес','Мест','Багажник','ABS','Права');
  my $specs = join '', map { qq{<div><dt>$_</dt><dd>${\ esc($spec{$_})}</dd></div>} } @order;
  my $about = join '', map { "<p>$_</p>" } @{ $b->{about} };
  my $pros = join '', map { qq{<li>$_</li>} } @{ $b->{pros} };
  # галерея: главное фото, стрелки и миниатюры — если фото больше одного
  my @ph = photos($b);
  my $alt = esc("$b->{name} в аренду в Нячанге");
  my $thumbs = @ph > 1 ? qq{<div class="pgal__thumbs">${\ join '', map { qq{<button type="button" class="pgal__thumb${\ ($_ ? '' : ' is-on')}" data-gal-thumb="$_" aria-label="Фото ${\ ($_ + 1)}"><img src="${\ photo_url($ph[$_])}" alt="" width="160" height="120" loading="lazy"></button>} } 0 .. $#ph}</div>} : '';
  my $arrows = @ph > 1 ? qq{<button type="button" class="pgal__nav pgal__nav--prev" data-gal-step="-1" aria-label="Предыдущее фото">${\ icon('arrow')}</button><button type="button" class="pgal__nav" data-gal-step="1" aria-label="Следующее фото">${\ icon('arrow')}</button>} : '';
  my $gallery = qq{<div class="pgal" data-gal data-photos="${\ esc(join ' ', map { photo_url($_) } @ph)}"><div class="pgal__main"><img src="${\ img_url($b)}" alt="$alt" width="540" height="400" fetchpriority="high" data-gal-main><span class="bike__badges">${\ ($b->{license} eq 'none' ? '<span class="badge badge--green">Без прав</span>' : '')}${\ ($b->{abs} ? '<span class="badge">ABS</span>' : '')}</span></div>$arrows</div>$thumbs};
  # срок: готовые варианты, как размеры в карточке товара
  my $days = $CARD_DAYS;
  my $terms = join '', map { qq{<button type="button" class="pterm${\ ($_ == $days ? ' is-on' : '')}" data-term="$_">${\ plural($_, 'день', 'дня', 'дней')}</button>} } 1, 3, 7, 14, 30;
  my $per = r100(rate($b, $days));
  my @similar = similar_for($b->{slug}, $b->{group}, $b->{p1});
  my $sim = join '', map { bike_card($_, h=>'h3', sfx=>'-s') } @similar;
  my ($cat) = grep { my $f = $_->{filter}; $f->{groups} && @{ $f->{groups} } == 1 && $f->{groups}[0] eq $b->{group} } @CATEGORIES;
  my $catlink = $cat ? [$cat->{h1}, "/$cat->{slug}/"] : ['Каталог', '/katalog/'];
  my $tot = cost($b, $days);
  my $lic = $b->{license};
  my $incl = join '', map { "<li>$_</li>" } 'Доставка и возврат по Нячангу — бесплатно', '2 шлема и 2 дождевика', 'Держатель для телефона и замок', 'Документы на байк и страхование ответственности', 'Бесплатная замена при поломке', 'Поддержка на русском в Telegram и WhatsApp';
  my $dw = plural($days, 'день', 'дня', 'дней');
  my $body = <<"H";
<section class="section section--top">
  <div class="container">
    <div class="pcard" data-product data-p1="$b->{p1}" data-p7="$b->{p7}" data-pm="$b->{pm}" data-slug="$b->{slug}" data-days="$days">
      <div class="pcard__top"><a class="pcard__back" href="${\ u($catlink->[1])}">${\ icon('arrow')} ${\ ($cat ? "Назад к подборке «$cat->{chip}»" : 'Назад в каталог')}</a></div>
      <div class="pcard__grid">
        <div class="pcard__gallery">$gallery</div>
        <div class="pcard__info">
          <h1 class="pcard__title">$b->{name}<span>$b->{type} · ${\ cc_label($b)} · $b->{year} · аренда в Нячанге</span></h1>
          <div class="pcard__price"><b data-pperday>${\ vnd($per)}</b><span>/ день</span><s data-pold${\ ($per < $b->{p1} ? '' : ' hidden')}>${\ vnd($b->{p1})}</s></div>
          <div class="ptabs" role="tablist">
            <button type="button" role="tab" class="is-on" aria-selected="true" data-tab="0">Описание</button>
            <button type="button" role="tab" aria-selected="false" data-tab="1">Характеристики</button>
            <button type="button" role="tab" aria-selected="false" data-tab="2">Что входит</button>
            <button type="button" role="tab" aria-selected="false" data-tab="3">Условия</button>
          </div>
          <div class="ppanel" role="tabpanel" data-panel="0">
            <div class="pdesc" data-more><p><b>$b->{short}</b></p>$about<p><b>Кому подойдёт:</b> $b->{suits}</p><ul class="list-check">$pros</ul></div>
            <button type="button" class="pmore" data-more-btn>Читать далее</button>
          </div>
          <div class="ppanel" role="tabpanel" data-panel="1" hidden><dl class="pspecs">$specs</dl></div>
          <div class="ppanel" role="tabpanel" data-panel="2" hidden><ul class="list-check">$incl</ul></div>
          <div class="ppanel" role="tabpanel" data-panel="3" hidden><ul class="list-check"><li>${\ lic_text($b)}</li><li>Документы: фото паспорта со штампом о въезде${\ ($lic ne 'none' ? ', права категории ' . ($lic eq 'A1' ? 'A1/A' : 'A') . ' и МВУ' : '')}. Паспорт остаётся у вас</li><li>Минимальный срок — 1 день. С 7 дней цена за день ниже, от 30 дней — самая выгодная</li><li>Оплата при получении: рубли на карту РФ, донги, доллары, USDT</li><li>Бензин не входит в стоимость — верните байк с тем же уровнем топлива</li></ul></div>
          <div class="popts">
            <div><p class="popts__label">Срок аренды</p><div class="pterms" role="group" aria-label="Срок аренды">$terms</div></div>
            <div class="ptotal"><div><span data-psum-label>Итого за $dw</span><small data-prub>${\ rub($tot)}</small></div><b data-ptotal>${\ vnd($tot)}</b></div>
          </div>
          <div class="pcard__btns">
            <a class="btn btn--light pcard__tg" href="https://t.me/$SITE{telegram}" rel="nofollow" data-goal="tg">${\ icon('telegram')} Спросить в Telegram</a>
            <button class="btn btn--orange" type="button" data-book="$b->{slug}" data-goal="book_open">Забронировать</button>
          </div>
          <p class="pcard__note">Без предоплаты · привезём к отелю бесплатно</p>
        </div>
      </div>
    </div>
  </div>
</section>
<section class="section"><div class="container faq-wrap"><div><h2 class="h2">Вопросы о $b->{name}</h2></div>${\ faq_html(@faq)}</div></section>
<section class="section section--grey"><div class="container"><div class="head"><h2 class="h2">Похожие байки</h2><a class="btn btn--dark" href="${\ u($catlink->[1])}">Смотреть все</a></div><div class="grid">$sim</div></div></section>
${\ cta_block("Забронируйте $b->{name} сейчас", 'Без предоплаты. Привезём к отелю бесплатно в удобное время.')}
H
  page(path=>"/arenda/$b->{slug}/", priority=>'0.8', bodyclass=>'bike-page',
    title=>"Аренда $b->{name} в Нячанге — от " . vnd($b->{p7}) . "/день, с доставкой",
    desc=>"Аренда $b->{name} в Нячанге: " . vnd($b->{p1}) . " в день, " . vnd($b->{pm}) . " в месяц. " . lic_label($b->{license}) . ". Бесплатная доставка в отель, без залога паспорта, 2 шлема в комплекте.",
    crumbs=>[['Главная','/'], $catlink, [$b->{name}, "/arenda/$b->{slug}/"]], body=>$body,
    ld=>[ product_ld($b), faq_ld(@faq) ]);
}
sub similar_for {
  my ($slug, $group, $bp) = @_;
  my %seen;
  my @s = grep { !$seen{$_->{slug}}++ }
    (sort({ $a->{rank} <=> $b->{rank} } grep { $_->{group} eq $group && $_->{slug} ne $slug } @BIKES),
     sort({ abs($a->{p1} - $bp) <=> abs($b->{p1} - $bp) } grep { $_->{group} ne $group } @BIKES));
  @s[0..2];
}
sub urlenc { my $s = shift; utf8::encode($s); $s =~ s/([^A-Za-z0-9\-_.~])/sprintf('%%%02X', ord $1)/ge; $s }

sub build_info {
  my $p = shift;
  my $faq = $p->{faq} ? qq{<section class="section section--grey"><div class="container faq-wrap"><div><h2 class="h2">Вопросы и ответы</h2></div>${\ faq_html(@{ $p->{faq} })}</div></section>} : '';
  my $extra = $p->{slug} eq 'kak-arendovat' ? qq{<section class="section section--grey"><div class="container"><h2 class="h2">4 шага до байка</h2>${\ steps_html()}</div></section>} : '';
  $extra .= qq{<section class="section"><div class="container"><h2 class="h2">Что входит в аренду</h2>${\ included_html()}</div></section>} if $p->{slug} =~ /^(dostavka|o-nas)$/;
  my $body = <<"H";
<section class="section section--top"><div class="container text text--page">
  <h1 class="h1">$p->{h1}</h1>
  <p class="lead">${\ fill($p->{lead})}</p>
  ${\ fill($p->{body})}
</div></section>
$extra
$faq
${\ ($p->{noindex} ? '' : cta_block())}
H
  my @ld; push @ld, faq_ld(@{ $p->{faq} }) if $p->{faq};
  push @ld, { '@type'=>'Article', headline=>$p->{h1}, description=>$p->{desc}, inLanguage=>'ru', dateModified=>$TODAY, author=>{ '@id'=>abs_url('/#org') }, publisher=>{ '@id'=>abs_url('/#org') }, mainEntityOfPage=>abs_url("/$p->{slug}/") } if $p->{slug} eq 'prava-vo-vetname';
  page(path=>"/$p->{slug}/", priority=>'0.6', bodyclass=>'info-page', title=>$p->{title}, desc=>$p->{desc}, noindex=>$p->{noindex},
    crumbs=>[['Главная','/'],[$p->{h1}, "/$p->{slug}/"]], body=>$body, ld=>\@ld);
}

sub build_faq {
  my @all = (@FAQ_MAIN, map { @{ $_->{faq} } } grep { $_->{faq} } @CATEGORIES, @PAGES);
  my %seen; @all = grep { !$seen{$_->[0]}++ } @all;
  my $body = <<"H";
<section class="section section--top"><div class="container">
  <h1 class="h1">Вопросы и ответы об аренде байка в Нячанге</h1>
  <p class="lead">Собрали ответы на всё, что спрашивают перед арендой: права, документы, цены, доставка, поломки.</p>
  ${\ faq_html(@all)}
</div></section>
${\ cta_block('Остались вопросы?', 'Напишите — живой человек ответит за 5 минут.')}
H
  page(path=>'/faq/', priority=>'0.7', title=>'Аренда байка в Нячанге: ответы на частые вопросы — права, цены, доставка',
    desc=>'Ответы на частые вопросы об аренде байка в Нячанге: нужны ли права, какие нужны документы, сколько стоит, как работает доставка и что делать при поломке.',
    crumbs=>[['Главная','/'],['FAQ','/faq/']], body=>$body, ld=>[ faq_ld(@all) ]);
}

sub build_404 {
  page(path=>'/404.html', noindex=>1, title=>'Страница не найдена — MYBIKE', desc=>'Страница не найдена',
    body=>qq{<section class="section section--top"><div class="container text"><h1 class="h1">Страница не найдена</h1><p class="lead">Возможно, байк уже уехал. Посмотрите весь парк:</p><p><a class="btn btn--orange" href="${\ u('/katalog/')}">Каталог байков</a></p></div></section>});
}

# ------------------------------------------------------------ static files
sub build_static {
  my $src = "$Bin/src";
  find({ no_chdir=>1, wanted=>sub {
    return unless -f $_;
    (my $rel = $_) =~ s{^\Q$src\E}{};
    make_path("$OUT" . ($rel =~ s{/[^/]+$}{}r));
    copy($_, "$OUT$rel") or die "copy $_: $!";
  }}, $src);

  my $sm = join '', map { "  <url><loc>${\ abs_url($_->[0])}</loc><lastmod>$TODAY</lastmod><priority>$_->[1]</priority></url>\n" } @SITEMAP;
  write_file('/sitemap.xml', qq{<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n$sm</urlset>\n});
  write_file('/robots.txt', "User-agent: *\nAllow: /\nDisallow: /*?\nDisallow: $B/admin/\n\nUser-agent: Yandex\nAllow: /\nDisallow: $B/admin/\nClean-param: ysclid&utm_source&utm_medium&utm_campaign&utm_content&utm_term&from&to&type\n\nSitemap: ${\ abs_url('/sitemap.xml')}\nHost: $SITE{url}\n");
  write_file('/manifest.webmanifest', $JSON->encode({ name=>'MYBIKE — аренда байков в Нячанге', short_name=>'MYBIKE', start_url=>u('/'), display=>'standalone', background_color=>'#ffffff', theme_color=>'#FF6B2C', icons=>[{ src=>u('/assets/img/favicon.svg'), sizes=>'any', type=>'image/svg+xml' }] }));

  # llms.txt — краткая выжимка для ИИ-поисковиков (GEO)
  my $bl = join '', map { '- [' . $_->{name} . '](' . abs_url("/arenda/$_->{slug}/") . '): ' . cc_label($_) . ', ' . lic_label($_->{license}) . '. ' . vnd($_->{p1}) . '/день (1–6 дн.), ' . vnd($_->{p7}) . '/день (7–29 дн.), ' . vnd($_->{pm}) . "/30 дней.\n" } sort { $a->{p1} <=> $b->{p1} } @BIKES;
  my $cl = join '', map { '- [' . $_->{h1} . '](' . abs_url("/$_->{slug}/") . '): ' . strip($_->{lead}) . "\n" } @CATEGORIES;
  my $fq = join '', map { "### $_->[0]\n${\ strip(fill($_->[1]))}\n\n" } @FAQ_MAIN;
  my $inc = join '', map { "- $_->[1]: $_->[2]\n" } @INCLUDED;
  write_file('/llms.txt', <<"T");
# MYBIKE — аренда байков в Нячанге (Вьетнам)

> Сервис аренды скутеров, мотоциклов и электроскутеров в Нячанге для русскоязычных туристов. Без залога паспорта, бесплатная доставка в отель, 2 шлема в комплекте. Есть байки без прав (50 см³ и электро). Цены от 100 000 ₫ в день.

Контакты: Telegram https://t.me/$SITE{telegram}, WhatsApp https://wa.me/$SITE{whatsapp}, телефон $SITE{phone}, $SITE{address}. Режим работы: $SITE{hours}.

## Условия
$inc
## Подборки
$cl
## Байки и цены (₫, вьетнамские донги)
$bl
## Частые вопросы
$fq
T
}

# ------------------------------------------------------------ run
remove_tree($OUT) if -d $OUT;
make_path($OUT);
build_home();
build_catalog();
build_category($_) for @CATEGORIES;
build_bike($_) for @BIKES;
build_info($_) for @PAGES;
build_faq();
build_404();
build_static();
build_admin();
write_file('/.nojekyll', '');
printf "OK: %d страниц в sitemap, вывод в %s\n", scalar @SITEMAP, $OUT;

# ------------------------------------------------------------ админка: конфиг, сид демо-данных, версия сборки
sub build_admin {
  # config.js — публичные настройки (anon key Supabase публичный по задумке)
  my %cfg = (site_base=>$B, repo=>$SITE{repo} // '', sb_url=>$SITE{sb_url} // '', sb_key=>$SITE{sb_key} // '');
  write_file('/admin/config.js', 'window.MYBIKE_ADMIN=' . $JSON->encode(\%cfg) . ";\n");
  # index.html: версия файлов
  my $idx = "$OUT/admin/index.html";
  open my $in, '<:encoding(UTF-8)', $idx or die "$idx: $!"; my $h = do { local $/; <$in> }; close $in;
  $h =~ s/__VER__/$VER/g;
  write_file('/admin/index.html', $h);
  # seed.json — текущие модели и тексты в формате базы (стартовые данные админки)
  my @site_keys = qw(name url phone phone_raw whatsapp telegram vk email address street lat lng rub_rate usd_rate founded clients fleet_size ym ga yandex_verification google_verification);
  my $obj = sub { my ($list, @k) = @_; [ map { my $t = $_; +{ map { $k[$_] => $t->[$_] } 0..$#k } } @$list ] };
  my %content = (
    site     => { map { $_ => $SITE{$_} // '' } @site_keys },
    reviews  => $obj->(\@REVIEWS, qw(name city text)),
    faq_main => $obj->(\@FAQ_MAIN, qw(q a)),
    included => $obj->(\@INCLUDED, qw(icon title text)),
    compare  => $obj->(\@COMPARE, qw(row us them)),
    delivery => $obj->(\@DELIVERY, qw(place price time)),
    steps    => $obj->(\@STEPS, qw(title text)),
    categories => [ map { my %c = %$_; $c{sections} = $obj->($c{sections} || [], qw(h2 html)); $c{faq} = $obj->($c{faq} || [], qw(q a)); \%c } @CATEGORIES ],
    pages    => [ map { my %p = %$_; $p{faq} = $obj->($p{faq} || [], qw(q a)); $p{noindex} = $p{noindex} ? JSON::PP::true : JSON::PP::false; \%p } @PAGES ],
  );
  my @bikes = map {
    my %b = %$_; $b{id} = delete $b{slug}; $b{grp} = delete $b{group};
    $b{$_} = $b{$_} ? JSON::PP::true : JSON::PP::false for qw(abs popular);
    $b{visible} = JSON::PP::true; $b{$_} += 0 for grep { defined $b{$_} } qw(cc year seats speed p1 p7 pm rank);
    \%b
  } @BIKES;
  write_file('/admin/seed.json', $JSON->encode({ bikes=>\@bikes, content=>\%content }));
  write_file('/build.json', $JSON->encode({ built_at=>strftime('%Y-%m-%dT%H:%M:%S', gmtime) . 'Z', pages=>scalar @SITEMAP, version=>$VER }));
}
