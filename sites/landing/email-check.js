// Made by sites/make-email-check.mjs from packages/contracts/src/email-check.ts: change that, not this. A test there runs the same
// addresses through both. Sets window.checkEmail(text), which answers
// {kind: 'ok'} | {kind: 'suggest', suggestion} | {kind: 'impossible', suggestion?}.
/** Every top-level domain in IANA's list (https://data.iana.org/TLD/tlds-alpha-by-domain.txt, version 2026110900). */
const TLD_LIST = `
aaa aarp abb abbott abbvie abc able abogado abudhabi ac academy accenture accountant accountants
aco actor ad ads adult ae aeg aero aetna af afl africa ag agakhan agency ai aig airbus airforce
airtel akdn al alibaba alipay allfinanz allstate ally alsace alstom am amazon americanexpress
americanfamily amex amfam amica amsterdam analytics android anquan anz ao aol apartments app
apple aq aquarelle ar arab aramco archi army arpa art arte as asda asia associates at athleta
attorney au auction audi audible audio auspost author auto autos aw aws ax axa az azure ba baby
baidu banamex band bank bar barcelona barclaycard barclays barefoot bargains baseball basketball
bauhaus bayern bb bbc bbt bbva bcg bcn bd be beats beauty beer berlin best bestbuy bet bf bg bh
bharti bi bible bid bike bing bingo bio biz bj black blackfriday blockbuster blog bloomberg blue
bm bms bmw bn bnpparibas bo boats boehringer bofa bom bond boo book booking bosch bostik boston
bot boutique box br bradesco bridgestone broadway broker brother brussels bs bt build builders
business buy buzz bv bw by bz bzh ca cab cafe cal call calvinklein cam camera camp canon
capetown capital capitalone car caravan cards care career careers cars casa case cash casino cat
catering catholic cba cbn cbre cc cd center ceo cern cf cfa cfd cg ch chanel channel charity
chase chat cheap chintai christmas chrome church ci cipriani circle cisco citadel citi citic
city ck cl claims cleaning click clinic clinique clothing cloud club clubmed cm cn co coach
codes coffee college cologne com commbank community company compare computer comsec condos
construction consulting contact contractors cooking cool coop corsica country coupon coupons
courses cpa cr credit creditcard creditunion cricket crown crs cruise cruises cu cuisinella cv
cw cx cy cymru cyou cz dad dance data date dating datsun day dclk dds de deal dealer deals
degree delivery dell deloitte delta democrat dental dentist desi design dev dhl diamonds diet
digital direct directory discount discover dish diy dj dk dm dnp do docs doctor dog domains dot
download drive dtv dubai dupont durban dvag dvr dz earth eat ec eco edeka edu education ee eg
email emerck energy engineer engineering enterprises epson equipment er ericsson erni es esq
estate et eu eurovision eus events exchange expert exposed express extraspace fage fail
fairwinds faith family fan fans farm farmers fashion fast fedex feedback ferrari ferrero fi
fidelity fido film final finance financial fire firestone firmdale fish fishing fit fitness fj
fk flickr flights flir florist flowers fly fm fo foo food football ford forex forsale forum
foundation fox fr free fresenius frl frogans frontier ftr fujitsu fun fund furniture futbol fyi
ga gal gallery gallo gallup game games gap garden gay gb gbiz gd gdn ge gea gent genting george
gf gg ggee gh gi gift gifts gives giving gl glass gle global globo gm gmail gmbh gmo gmx gn
godaddy gold goldpoint golf goodyear goog google gop got gov gp gq gr grainger graphics gratis
green gripe grocery group gs gt gu gucci guge guide guitars guru gw gy hair hamburg hangout haus
hbo hdfc hdfcbank health healthcare help here hermes hiphop hisamitsu hitachi hiv hk hkt hm hn
hockey holdings holiday homedepot homegoods homes homesense honda horse hospital host hosting
hot hotels hotmail house how hr hsbc ht hu hughes hyatt hyundai ibm icbc ice icu id ie ieee ifm
ikano il im imamat imdb immo immobilien in inc industries infiniti info ing ink institute
insurance insure int international intuit investments io ipiranga iq ir irish is ismaili ist
istanbul it itau itv jaguar java jcb je jeep jetzt jewelry jio jll jm jmp jnj jo jobs joburg jot
joy jp jpmorgan jprs juegos kaufen kddi ke kerryhotels kerryproperties kfh kg kh ki kia kids kim
kindle kitchen kiwi km kn koeln komatsu kosher kp kpmg kpn kr krd kred kuokgroup kw ky kyoto kz
la lacaixa lamborghini lamer land landrover lanxess lasalle lat latino latrobe law lawyer lb lc
lds lease leclerc lefrak legal lego lexus lgbt li lidl life lifeinsurance lifestyle lighting
like lilly limited limo lincoln link live living lk llc llp loan loans locker locus lol london
lotte lotto love lpl lplfinancial lr ls lt ltd ltda lu lundbeck luxe luxury lv ly ma madrid maif
maison makeup man management mango map market marketing markets marriott marshalls mattel mba mc
mckinsey md me med media meet melbourne meme memorial men menu merck merckmsd mg mh miami
microsoft mil mini mint mit mitsubishi mk ml mlb mls mm mma mn mo mobi mobile moda moe moi mom
monash money monster mormon mortgage moscow moto motorcycles mov movie mp mq mr ms msd mt mtn
mtr mu museum music mv mw mx my mz na nab nagoya name navy nba nc ne nec net netbank netflix
network neustar new news next nextdirect nexus nf nfl ng ngo nhk ni nico nike nikon ninja nissan
nissay nl no nokia norton now nowruz nowtv np nr nra nrw ntt nu nyc nz obi observer office
okinawa olayan olayangroup ollo om omega one ong onl online ooo open oracle orange org organic
origins osaka otsuka ott ovh pa page panasonic paris pars partners parts party pay pccw pe pet
pf pfizer pg ph pharmacy phd philips phone photo photography photos physio pics pictet pictures
pid pin ping pink pioneer pizza pk pl place play playstation plumbing plus pm pn pnc pohl poker
politie porn post pr praxi press prime pro prod productions prof progressive promo properties
property protection pru prudential ps pt pub pw pwc py qa qpon quebec quest racing radio re read
realestate realtor realty recipes red redumbrella rehab reise reisen reit reliance ren rent
rentals repair report republican rest restaurant review reviews rexroth rich richardli ricoh ril
rio rip ro rocks rodeo rogers room rs rsvp ru rugby ruhr run rw rwe ryukyu sa saarland safe
safety sakura sale salon samsclub samsung sandvik sandvikcoromant sanofi sap sarl sas save saxo
sb sbi sbs sc scb schaeffler schmidt scholarships school schule schwarz science scot sd se
search seat secure security seek select sener services seven sew sex sexy sfr sg sh shangrila
sharp shell shia shiksha shoes shop shopping shouji show si silk sina singles site sj sk ski
skin sky skype sl sling sm smart smile sn sncf so soccer social softbank software sohu solar
solutions song sony soy spa space sport spot sr srl ss st stada staples star statebank statefarm
stc stcgroup stockholm storage store stream studio study style su sucks supplies supply support
surf surgery suzuki sv swatch swiss sx sy sydney systems sz tab taipei talk taobao target
tatamotors tatar tattoo tax taxi tc tci td tdk team tech technology tel temasek tennis teva tf
tg th thd theater theatre tiaa tickets tienda tips tires tirol tj tjmaxx tjx tk tkmaxx tl tm
tmall tn to today tokyo tools top toray toshiba total tours town toyota toys tr trade trading
training travel travelers travelersinsurance trust trv tt tube tui tunes tushu tv tvs tw tz ua
ubank ubs ug uk unicom university uno uol ups us uy uz va vacations vana vanguard vc ve vegas
ventures verisign versicherung vet vg vi viajes video vig viking villas vin vip virgin visa
vision viva vivo vlaanderen vn vodka volvo vote voting voto voyage vu wales walmart walter wang
wanggou watch watches weather weatherchannel web webcam weber website wed wedding weibo weir wf
whoswho wien wiki williamhill win windows wine winners wme woodside work works world wow ws wtc
wtf xbox xerox xihuan xin xn--11b4c3d xn--1ck2e1b xn--1qqw23a xn--2scrj9c xn--30rr7y xn--3bst00m
xn--3ds443g xn--3e0b707e xn--3hcrj9c xn--3pxu8k xn--42c2d9a xn--45br5cyl xn--45brj9c xn--45q11c
xn--4dbrk0ce xn--4gbrim xn--54b7fta0cc xn--55qw42g xn--55qx5d xn--5su34j936bgsg xn--5tzm5g
xn--6frz82g xn--6qq986b3xl xn--80adxhks xn--80ao21a xn--80aqecdr1a xn--80asehdb xn--80aswg
xn--8y0a063a xn--90a3ac xn--90ae xn--90ais xn--9dbq2a xn--9et52u xn--9krt00a xn--b4w605ferd
xn--bck1b9a5dre4c xn--c1avg xn--c2br7g xn--cck2b3b xn--cckwcxetd xn--cg4bki
xn--clchc0ea0b2g2a9gcd xn--czr694b xn--czrs0t xn--czru2d xn--d1acj3b xn--d1alf xn--e1a4c
xn--eckvdtc9d xn--efvy88h xn--fct429k xn--fhbei xn--fiq228c5hs xn--fiq64b xn--fiqs8s xn--fiqz9s
xn--fjq720a xn--flw351e xn--fpcrj9c3d xn--fzc2c9e2c xn--fzys8d69uvgm xn--g2xx48c xn--gckr3f0f
xn--gecrj9c xn--gk3at1e xn--h2breg3eve xn--h2brj9c xn--h2brj9c8c xn--hxt814e xn--i1b6b1a6a2e
xn--imr513n xn--io0a7i xn--j1aef xn--j1amh xn--j6w193g xn--jlq480n2rg xn--jvr189m
xn--kcrx77d1x4a xn--kprw13d xn--kpry57d xn--kput3i xn--l1acc xn--lgbbat1ad8j xn--mgb9awbf
xn--mgba3a3ejt xn--mgba3a4f16a xn--mgba7c0bbn0a xn--mgbaam7a8h xn--mgbab2bd xn--mgbah1a3hjkrd
xn--mgbai9azgqp6j xn--mgbayh7gpa xn--mgbbh1a xn--mgbbh1a71e xn--mgbc0a9azcg xn--mgbca7dzdo
xn--mgbcpq6gpa1a xn--mgberp4a5d4ar xn--mgbgu82a xn--mgbi4ecexp xn--mgbpl2fh xn--mgbt3dhd
xn--mgbtx2b xn--mgbx4cd0ab xn--mix891f xn--mk1bu44c xn--mxtq1m xn--ngbc5azd xn--ngbe9e0a
xn--ngbrx xn--node xn--nqv7f xn--nqv7fs00ema xn--nyqy26a xn--o3cw4h xn--ogbpf8fl xn--otu796d
xn--p1acf xn--p1ai xn--pgbs0dh xn--pssy2u xn--q7ce6a xn--q9jyb4c xn--qcka1pmc xn--qxa6a xn--qxam
xn--rhqv96g xn--rovu88b xn--rvc1e0am3e xn--s9brj9c xn--ses554g xn--t60b56a xn--tckwe
xn--tiq49xqyj xn--unup4y xn--vermgensberater-ctb xn--vermgensberatung-pwb xn--vhquv xn--vuq861b
xn--w4r85el8fhu5dnra xn--w4rs40l xn--wgbh1c xn--wgbl6a xn--xhq521b xn--xkc2al3hye2a
xn--xkc2dl3a5ee0h xn--y9a3aq xn--yfro4i67o xn--ygbi2ammx xn--zfr164b xxx xyz yachts yahoo
yamaxun yandex ye yodobashi yoga yokohama you youtube yt yun za zappos zara zero zip zm zone
zuerich zw
`;
const REAL_ENDINGS = new Set(TLD_LIST.split(/\s+/).filter((tld) => tld !== ''));
const KNOWN_DOMAINS = [
  'gmail.com',
  'hotmail.co.uk',
  'hotmail.com',
  'outlook.com',
  'yahoo.co.uk',
  'yahoo.com',
  'icloud.com',
  'googlemail.com',
  'btinternet.com',
  'live.co.uk',
  'outlook.co.uk',
  'live.com',
  'sky.com',
  'msn.com',
  'me.com',
  'aol.com',
  'aol.co.uk',
  'talktalk.net',
  'virginmedia.com',
  'ntlworld.com',
  'btopenworld.com',
  'blueyonder.co.uk',
  'tiscali.co.uk',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'gmx.co.uk',
  'mail.com',
];
/** What can come after the name in a UK address: co.uk, org.uk and so on. */
const UK_SECOND_LEVELS = [
  'co',
  'org',
  'me',
  'ltd',
  'plc',
  'net',
  'sch',
  'ac',
  'gov',
  'nhs',
  'police',
  'mod',
];
/** The endings a mistyped ending is most likely meant to be. */
const COMMON_ENDINGS = ['com', 'net', 'org', 'uk', 'info', 'biz', 'io', 'edu', 'gov'];
/** Real endings that are mostly typos of another: .cm and .om for .com, when nothing else about the address says otherwise. */
const TYPO_PRONE_ENDINGS = { cm: 'com', om: 'com' };
/** Endings that lost their dot. */
const RUN_TOGETHER_ENDINGS = { couk: 'co.uk', orguk: 'org.uk' };
/** The first word of a big provider's address is only ever theirs, so gmail.co.uk or hotmail.uk can only be a slip. */
const MIN_PROVIDER_NAME_LENGTH = 5;
/** The fewest changes (a letter added, dropped or changed, or two next to each other swapped) that turn `a` into `b`. */
function distance(a, b) {
  const width = b.length + 1;
  const cells = new Array((a.length + 1) * width).fill(0);
  const cell = (i, j) => cells[i * width + j] ?? 0;
  for (let i = 0; i <= a.length; i += 1) cells[i * width] = i;
  for (let j = 0; j <= b.length; j += 1) cells[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const same = a[i - 1] === b[j - 1] ? 0 : 1;
      let least = Math.min(cell(i - 1, j) + 1, cell(i, j - 1) + 1, cell(i - 1, j - 1) + same);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        least = Math.min(least, cell(i - 2, j - 2) + 1);
      }
      cells[i * width + j] = least;
    }
  }
  return cell(a.length, b.length);
}
/** The nearest of `options` to `word` within one change, or undefined. The first of equally near ones wins. */
function nearest(word, options) {
  return options.find((option) => distance(word, option) === 1);
}
/** What the part after the @ was probably meant to be, or undefined when it looks like nobody's slip. */
function suggestDomain(domain, tldIsReal) {
  const labels = domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  // A big provider with a slip anywhere: gmial.com, outlook.con, hotmail.com.uk.
  const allowed = domain.length <= 9 ? 1 : 2;
  let best;
  for (const known of KNOWN_DOMAINS) {
    const apart = distance(domain, known);
    if (apart <= allowed && (best === undefined || apart < best.apart)) best = { known, apart };
  }
  if (best !== undefined) return best.known;
  // A big provider's name with an ending it does not use: gmail.co.uk, hotmail.uk.
  const name = labels[0] ?? '';
  if (name.length >= MIN_PROVIDER_NAME_LENGTH) {
    const ofProvider = KNOWN_DOMAINS.filter((known) => known.split('.')[0] === name);
    if (ofProvider.length > 0) {
      return ofProvider.find((known) => known.endsWith(`.${tld}`)) ?? ofProvider[0];
    }
  }
  if (tld in RUN_TOGETHER_ENDINGS) {
    return `${labels.slice(0, -1).join('.')}.${RUN_TOGETHER_ENDINGS[tld]}`;
  }
  // smith.ci.uk: the word before .uk is not one UK addresses use.
  if (tld === 'uk' && labels.length >= 3) {
    const second = labels[labels.length - 2] ?? '';
    if (!UK_SECOND_LEVELS.includes(second) && second.length <= 4) {
      const meant = nearest(second, UK_SECOND_LEVELS);
      if (meant !== undefined) return `${labels.slice(0, -2).join('.')}.${meant}.uk`;
    }
  }
  // smith.comg, smith.con: an ending that does not exist, next to one that does.
  if (!tldIsReal) {
    const meant = nearest(tld, COMMON_ENDINGS);
    if (meant !== undefined) return `${labels.slice(0, -1).join('.')}.${meant}`;
  } else if (labels.length === 2 && tld in TYPO_PRONE_ENDINGS) {
    return `${name}.${TYPO_PRONE_ENDINGS[tld]}`;
  }
  return undefined;
}
/** Looks for a slip in the part of an address after the @. The shape of the address is somebody else's check: this only reads on. */
function checkEmail(raw) {
  const email = raw.trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return { kind: 'ok' };
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes('.') || KNOWN_DOMAINS.includes(domain)) return { kind: 'ok' };
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  const tldIsReal = REAL_ENDINGS.has(tld);
  const meant = suggestDomain(domain, tldIsReal);
  const suggestion = meant === undefined ? undefined : `${email.slice(0, at)}@${meant}`;
  if (!tldIsReal) {
    return suggestion === undefined ? { kind: 'impossible' } : { kind: 'impossible', suggestion };
  }
  return suggestion === undefined ? { kind: 'ok' } : { kind: 'suggest', suggestion };
}

window.checkEmail = checkEmail;
