#!/usr/bin/perl
# Локальный предпросмотр:  perl serve.pl  →  http://localhost:8080
use strict; use warnings; use IO::Socket::INET; use FindBin qw($Bin);
$SIG{PIPE} = "IGNORE";
my $root = "$Bin/docs"; my $port = $ARGV[0] || 8080;
my %T = (html=>'text/html; charset=utf-8', css=>'text/css', js=>'application/javascript', svg=>'image/svg+xml', png=>'image/png', jpg=>'image/jpeg', webp=>'image/webp', xml=>'application/xml', txt=>'text/plain; charset=utf-8', webmanifest=>'application/manifest+json');
my $s = IO::Socket::INET->new(LocalAddr=>'127.0.0.1', LocalPort=>$port, Listen=>20, ReuseAddr=>1) or die "port $port: $!";
print "http://localhost:$port\n";
while (my $c = $s->accept) {
  my $req = <$c> // ''; while (my $l = <$c>) { last if $l =~ /^\r?\n$/ }
  my ($path) = $req =~ m{^GET\s+(\S+)}; $path //= '/'; $path =~ s/\?.*//; $path =~ s/%([0-9A-F]{2})/chr hex $1/gie; $path =~ s/\.\.//g;
  my $f = "$root$path"; $f .= 'index.html' if $f =~ m{/$}; $f .= '/index.html' if -d $f;
  my $code = '200 OK'; unless (-f $f) { $f = "$root/404.html"; $code = '404 Not Found' }
  my ($ext) = $f =~ /\.(\w+)$/; open my $fh, '<:raw', $f; local $/; my $body = <$fh>; close $fh;
  print $c "HTTP/1.1 $code\r\nContent-Type: " . ($T{$ext} // 'application/octet-stream') . "\r\nContent-Length: " . length($body) . "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n$body";
  close $c;
}
