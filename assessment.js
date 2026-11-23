const formatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

export const formatNumber = value => formatter.format(value);

export const values = {
  type: { new: 'Nyetablering', expansion: 'Utbyggnad' },
  cooling: { '': 'Okänd kylmetod', air: 'Luftkylning', water: 'Vattenbaserad kylning', hybrid: 'Hybridkylning', other: 'Annan kylning' },
  confirmation: { '': 'Okänt', yes: 'Ja', no: 'Nej' },
  water: { '': 'Okänt', yes: 'Bekräftad för behovet', no: 'Otillräcklig för behovet' }
};

export const scale = {
  2: { label: 'Gynnsam', tone: 'favorable' },
  1: { label: 'Delvis', tone: 'partial' },
  0: { label: 'Ogynnsam', tone: 'unfavorable' },
  null: { label: 'Uppgift saknas', tone: 'unknown' }
};

export function blankSite(county, municipality = '') {
  return {
    county, municipality, type: 'new', demand: '', capacity: '', cooling: '', nearby: '',
    heatAgreement: '', renewable: '', waterUse: '', waterAvailability: '', example: false
  };
}

export function exampleSite(county, municipality) {
  return {
    ...blankSite(county, municipality),
    demand: '125', capacity: '100', cooling: 'air', nearby: 'yes', heatAgreement: 'no',
    renewable: 'no', waterUse: '8000', waterAvailability: 'yes', example: true
  };
}

function supplied(value, minimum = 0) {
  return value !== '' && Number.isFinite(Number(value)) && Number(value) >= minimum;
}

function power(demand, capacity) {
  if (!supplied(demand, 0.1) || !supplied(capacity)) {
    return [null, 'Ange effektbehovet och be berört nätföretag om möjlig effekt och tidpunkt vid den tänkta anslutningspunkten.'];
  }
  const requested = Number(demand);
  const available = Number(capacity);
  if (requested > available) {
    return [0, `Behovet överstiger den angivna nätuppgiften med ${formatNumber(requested - available)} MW. Följ upp anslutningstid, etappindelning och eventuell nätförstärkning.`];
  }
  return [2, 'Den angivna nätuppgiften täcker effektbehovet. Bekräfta anslutningspunkt, tidpunkt och villkor med nätföretaget.'];
}

function heat(nearby, agreement) {
  if (agreement === 'yes') return [2, 'Ett avtal har angetts. Följ upp vilken mängd värme som kan levereras och när mottagaren behöver den.'];
  if (nearby === 'yes') return [1, 'Ett fjärrvärmenät finns enligt underlaget. Utred om en mottagare kan ta emot värmen och på vilka villkor.'];
  if (nearby === 'no' && agreement === 'no') return [0, 'Varken närliggande fjärrvärmenät eller avtal har angetts. Undersök andra möjliga värmemottagare.'];
  return [null, 'Ta reda på om det finns en möjlig värmemottagare och vilket underlag som finns om leverans.'];
}

function electricity(renewable) {
  if (renewable === 'yes') return [2, 'Ett avtal om ny förnybar elproduktion har angetts. Kontrollera omfattning, startdatum och hur avtalet kan följas upp.'];
  if (renewable === 'no') return [1, 'Inget avtal om ny förnybar produktion har angetts. Be exploatören beskriva elens ursprung och planerad upphandling.'];
  return [null, 'Be exploatören beskriva hur el ska köpas in och om avtalet omfattar ny förnybar produktion.'];
}

function water(cooling, use, availability) {
  if (availability === 'no') return [0, 'Vattentillgången har angetts som otillräcklig. Utred alternativ kylning eller försörjning.'];
  if (!cooling || !supplied(use)) return [null, 'Ange kylmetod och uppskattat vattenbehov. Kylmetoden ensam ger ingen uppgift om vattenuttaget.'];
  if (availability === 'yes') return [2, 'Vattentillgången har angetts som tillräcklig. Följ upp vattenbehovet vid hög belastning och under torra perioder.'];
  return [1, 'Kylmetod och vattenbehov finns i underlaget. Bekräfta vattenförsörjningen med ansvarig aktör.'];
}

export function evaluate(site) {
  const rows = [
    ['Elnät', ...power(site.demand, site.capacity)],
    ['Spillvärme', ...heat(site.nearby, site.heatAgreement)],
    ['Elens ursprung', ...electricity(site.renewable)],
    ['Vatten och kylning', ...water(site.cooling, site.waterUse, site.waterAvailability)]
  ].map(([label, score, explanation]) => ({ label, score, explanation }));

  const coverage = rows.filter(row => row.score !== null);
  if (coverage.length < rows.length) {
    return { rows, summary: 'Underlag behöver kompletteras', caption: `${coverage.length} av ${rows.length} områden bedömda`, tone: 'unknown' };
  }
  const total = coverage.reduce((sum, row) => sum + row.score, 0);
  const hasObstacle = coverage.some(row => row.score === 0);
  const caption = `${total}/8 poäng · förenklad modell`;
  if (hasObstacle) return { rows, summary: 'Hinder att utreda', caption, tone: 'unfavorable' };
  if (total < 7) return { rows, summary: 'Villkor att följa upp', caption, tone: 'partial' };
  return { rows, summary: 'Gynnsamt i modellen', caption, tone: 'favorable' };
}

export function questions(site) {
  return [
    'Hur stort är effektbehovet vid start och hur förändras det mellan utbyggnadsetapperna?',
    'Vilket PUE räknar ni med? PUE är datacentrets totala energianvändning delad med IT-utrustningens energianvändning.',
    site.heatAgreement === 'yes'
      ? 'Vem tar emot spillvärmen, hur mycket värme omfattas av avtalet och när kan den levereras?'
      : 'Finns en plan och en möjlig mottagare för spillvärmen? Vad krävs för att få ett avtal?',
    'Varifrån ska elen komma och ingår ny förnybar produktion i upphandlingen?',
    'Vilka arbetstillfällen skapas lokalt under byggtiden och i den löpande driften?',
    'Hur påverkas andra planerade anslutningar och etableringar vid den önskade tidpunkten?',
    'Hur stort är vattenbehovet vid normal drift och när anläggningen går som mest?'
  ];
}
