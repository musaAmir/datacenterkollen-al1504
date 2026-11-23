import { counties, municipalities } from './sweden.js';
import { blankSite, exampleSite, evaluate, formatNumber, questions, scale, values } from './assessment.js';

const app = document.querySelector('#app');
const views = { oversikt: 'Översikt över Sverige', plats: 'Platsbedömning', jamforelse: 'Jämför två platser', data: 'Om datan' };
const countiesByCode = new Map(counties.map(county => [county.code, county]));
const citiesByCode = new Map(municipalities.map(city => [city.code, city]));
const sortedCounties = [...counties].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
const sortedCities = [...municipalities].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

const layers = [
  { key: 'grid', title: 'Elnätskapacitet', description: 'Uppgifter om möjlig effekt och anslutningstid.' },
  { key: 'heat', title: 'Spillvärme', description: 'Möjlighet att ta tillvara värme från datacentret.' },
  { key: 'demand', title: 'Andra elbehov', description: 'Konkurrens om kapacitet från andra etableringar.' }
];

// Illustrations for prototyping the three layers. No county-level energy data is fetched.
const sampleLayers = {
  '22': { grid: 2, heat: 1, demand: 2 },
  '23': { grid: 2, heat: null, demand: 1 },
  '24': { grid: 1, heat: 2, demand: 1 },
  '25': { grid: 2, heat: 1, demand: 0 },
  '20': { grid: 1, heat: 0, demand: null },
  '01': { grid: 0, heat: 2, demand: 0 },
  '14': { grid: 1, heat: 2, demand: 1 },
  '12': { grid: 0, heat: 1, demand: 1 },
  '09': { grid: null, heat: 0, demand: null }
};
const mapColors = { favorable: '#9ccabd', partial: '#f4cf79', unfavorable: '#df9e8c', unknown: '#e4e9e2' };

function readLocation() {
  const params = new URLSearchParams(location.search);
  const city = citiesByCode.get(params.get('kommun'));
  const requestedCounty = city?.code.slice(0, 2) ?? params.get('lan');
  const requestedView = params.get('vy');
  return {
    route: Object.hasOwn(views, requestedView) ? requestedView : 'oversikt',
    county: countiesByCode.has(requestedCounty) ? requestedCounty : '22',
    municipality: city?.code ?? '',
    legacy: params.has('variant') || params.has('arende')
  };
}

const initial = readLocation();
let route = initial.route;
let countyCode = initial.county;
let municipalityCode = initial.municipality;
let activeLayer = 'grid';
const sites = { main: blankSite(countyCode, municipalityCode), other: null };
let mapResize;

function createUrl(target) {
  const url = new URL(location.pathname, location.origin);
  if (target !== 'oversikt') url.searchParams.set('vy', target);
  const current = target === 'plats' || target === 'jamforelse' ? sites.main : { county: countyCode, municipality: municipalityCode };
  if (target !== 'data') {
    url.searchParams.set('lan', current.county);
    if (current.municipality) url.searchParams.set('kommun', current.municipality);
  }
  return url;
}

function setSiteLocation(state, county, municipality = '') {
  if (state.county === county && state.municipality === municipality) return state;
  return {
    ...blankSite(county, municipality),
    type: state.type,
    demand: state.demand,
    cooling: state.cooling,
    renewable: state.renewable,
    waterUse: state.waterUse,
    example: state.example
  };
}

function navigate(target) {
  if (target === 'plats' && route === 'oversikt') {
    sites.main = setSiteLocation(sites.main, countyCode, municipalityCode);
  }
  route = target;
  history.pushState(null, '', createUrl(route));
  render(true);
}

function pill(score) {
  const { label, tone } = scale[score];
  return `<span class="status ${tone}">${label}</span>`;
}

function optionsMarkup(options, selected) {
  return options.map(([key, title]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${title}</option>`).join('');
}

function countyOptions(selected) {
  return optionsMarkup(sortedCounties.map(county => [county.code, county.name]), selected);
}

function countyPanel() {
  const county = countiesByCode.get(countyCode);
  const city = citiesByCode.get(municipalityCode);
  const hasSample = Object.hasOwn(sampleLayers, countyCode);
  return `<span class="flag">${hasSample ? 'Simulerad länsprofil' : 'Länsprofil'}</span>
    <h2 id="county-title">${county.name}</h2>
    ${city ? `<p>Vald kommun · ${city.name}</p>` : ''}
    <label class="field" for="county-select">Välj län
      <span class="select-wrap"><select id="county-select">${countyOptions(countyCode)}</select></span>
    </label>
    ${hasSample ? '' : '<p class="hint">Det här länet ingår i kartan. Exempeluppgifter saknas.</p>'}
    <dl class="status-list">${layers.map(layer => `<div><dt>${layer.title}</dt><dd>${pill(sampleLayers[countyCode]?.[layer.key] ?? null)}</dd></div>`).join('')}</dl>
    <h3>Uppgifter att hämta</h3>
    <ul class="source-list">
      <li>Möjlig effekt och anslutningstid från berört nätföretag.</li>
      <li>Värmebehov och mottagningskapacitet från energibolag eller annan värmemottagare.</li>
      <li>Planerade etableringar från kommunen, länsstyrelsen och berört nätföretag.</li>
    </ul>
    <a class="button primary full" href="?vy=plats&amp;lan=${countyCode}${city ? '&amp;kommun=' + city.code : ''}" data-nav="plats">Gör platsbedömning</a>`;
}

function renderOverview() {
  app.innerHTML = `<section class="hero overview-hero">
    <div><h1>Var finns förutsättningar för datacenter?</h1>
      <p>Utforska elnätskapacitet, möjligheten att ta tillvara spillvärme och andra stora elbehov inför en etablering eller utbyggnad.</p>
    </div>
    <div class="search">
      <label for="municipality-search" class="field">Sök kommun
        <input id="municipality-search" type="search" placeholder="Till exempel Sundsvall" autocomplete="off" aria-controls="search-results" aria-describedby="search-help">
        <span class="field-help" id="search-help">Sök bland Sveriges 290 kommuner.</span>
      </label>
      <ul class="search-results" id="search-results" aria-label="Kommunförslag" hidden></ul>
    </div>
  </section>
  <div class="overview-grid">
    <section class="card controls" aria-labelledby="layers-title">
      <h2 id="layers-title">Visa på kartan</h2>
      <div class="layer-list">${layers.map(layer => `<button class="layer" type="button" data-layer="${layer.key}" aria-pressed="${layer.key === activeLayer}"><strong>${layer.title}</strong><span>${layer.description}</span></button>`).join('')}</div>
      <div class="legend"><h3>Teckenförklaring</h3>
        <ul>${[2, 1, 0, null].map(score => `<li><span class="swatch ${scale[score].tone}" aria-hidden="true"></span>${scale[score].label}</li>`).join('')}</ul>
      </div>
    </section>
    <section class="card map-card" aria-labelledby="map-title">
      <div class="map-head"><h2 id="map-title">${layers.find(layer => layer.key === activeLayer).title} per län</h2><span class="flag">Simulerade kartlager</span></div>
      <div class="map-wrap">
        <canvas aria-label="Sverigekarta med alla 21 län. Du kan också välja län i länsprofilen." role="img"></canvas>
        <span class="map-tip" hidden></span>
      </div>
      <p class="map-caption">Välj ett län för att se det tillgängliga underlaget. Länsgränser från SCB.</p>
    </section>
    <aside class="card county" id="county-panel" aria-labelledby="county-title">${countyPanel()}</aside>
  </div>`;
  installMap();
  installSearch();
}

function updateCounty(code, city = '', focusSelect = false) {
  countyCode = code;
  municipalityCode = city;
  document.querySelector('#county-panel').innerHTML = countyPanel();
  document.querySelector('#municipality-search').value = citiesByCode.get(city)?.name ?? '';
  drawMap();
  history.replaceState(null, '', createUrl(route));
  if (focusSelect) document.querySelector('#county-select').focus();
}

let mapCanvas;
let mapTip;
let mapTransform;
let hoveredCounty;
let mapPaths;

function drawMap() {
  const { width, height } = mapCanvas.getBoundingClientRect();
  const deviceScale = devicePixelRatio || 1;
  const size = Math.min(width / 500, height / 1044);
  mapTransform = { size, x: (width - 500 * size) / 2, y: (height - 1044 * size) / 2 };
  mapCanvas.width = width * deviceScale;
  mapCanvas.height = height * deviceScale;
  const ctx = mapCanvas.getContext('2d');
  ctx.setTransform(
    size * deviceScale, 0, 0, size * deviceScale,
    mapTransform.x * deviceScale, mapTransform.y * deviceScale
  );
  ctx.lineJoin = 'round';

  for (const [code, path] of mapPaths) {
    ctx.fillStyle = mapColors[scale[sampleLayers[code]?.[activeLayer] ?? null].tone];
    ctx.fill(path, 'evenodd');
    ctx.lineWidth = 1.25 / size;
    ctx.strokeStyle = '#fff';
    ctx.stroke(path);
  }
  for (const code of new Set([hoveredCounty, countyCode])) {
    if (!code) continue;
    ctx.strokeStyle = code === countyCode ? '#124e45' : '#657a70';
    ctx.lineWidth = (code === countyCode ? 2.4 : 1.7) / size;
    ctx.stroke(mapPaths.get(code));
  }
}

function mapHit(event) {
  if (!mapTransform?.size) return undefined;
  const { size, x, y } = mapTransform;
  const bounds = mapCanvas.getBoundingClientRect();
  const px = (event.clientX - bounds.left - x) / size;
  const py = (event.clientY - bounds.top - y) / size;
  const ctx = mapCanvas.getContext('2d');
  ctx.save();
  ctx.resetTransform();
  const hit = [...mapPaths].find(([, path]) => ctx.isPointInPath(path, px, py, 'evenodd'))?.[0];
  ctx.restore();
  return hit;
}

function installMap() {
  mapCanvas = app.querySelector('canvas');
  mapTip = app.querySelector('.map-tip');
  mapPaths = new Map(counties.map(county => [county.code, new Path2D(county.path)]));
  hoveredCounty = undefined;
  drawMap();
  mapResize = new ResizeObserver(drawMap);
  mapResize.observe(mapCanvas);

  mapCanvas.addEventListener('click', event => {
    const hit = mapHit(event);
    if (!hit) return;
    updateCounty(hit, hit === countyCode ? municipalityCode : '');
    if (matchMedia('(max-width: 620px)').matches) document.querySelector('#county-panel').scrollIntoView();
  });
  mapCanvas.addEventListener('pointermove', event => {
    const hit = mapHit(event);
    if (hit === hoveredCounty) return;
    hoveredCounty = hit;
    mapCanvas.style.cursor = hit ? 'pointer' : 'default';
    mapTip.hidden = !hit;
    if (hit) mapTip.textContent = countiesByCode.get(hit).name;
    drawMap();
  });
  mapCanvas.addEventListener('pointerleave', () => {
    hoveredCounty = undefined;
    mapTip.hidden = true;
    drawMap();
  });
}

function installSearch() {
  const input = document.querySelector('#municipality-search');
  const results = document.querySelector('#search-results');
  input.value = citiesByCode.get(municipalityCode)?.name ?? '';
  let matches = [];
  function search() {
    const query = input.value.trim().toLocaleLowerCase('sv');
    matches = sortedCities.filter(city => city.name.toLocaleLowerCase('sv').startsWith(query)).slice(0, 8);
    results.hidden = !query;
    results.innerHTML = matches.length ? matches.map(city =>
      `<li><button type="button" data-city="${city.code}">${city.name}<small>${countiesByCode.get(city.code.slice(0, 2)).name}</small></button></li>`
    ).join('') : '<li class="empty">Ingen kommun matchar sökningen.</li>';
  }

  function selectCity(code) {
    updateCounty(code.slice(0, 2), code);
    results.hidden = true;
    input.focus();
  }

  input.addEventListener('input', search);
  input.addEventListener('keydown', event => {
    if (results.hidden) return;
    if (event.key === 'Escape') results.hidden = true;
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      results.querySelector('button').focus();
    }
    if (event.key === 'Enter' && matches.length) selectCity(matches[0].code);
  });
  results.addEventListener('click', event => {
    const button = event.target.closest('button[data-city]');
    if (button) selectCity(button.dataset.city);
  });
  results.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      results.hidden = true;
      input.focus();
    }
  });
  input.closest('.search').addEventListener('focusout', event => {
    if (!event.currentTarget.contains(event.relatedTarget)) results.hidden = true;
  });
}

function selectField(id, key, label, options, selected) {
  return `<label class="field" for="${id}-${key}">${label}
    <span class="select-wrap"><select id="${id}-${key}" name="${key}">${optionsMarkup(options, selected)}</select></span>
  </label>`;
}

function numberField(id, key, label, value, attributes) {
  return `<label class="field" for="${id}-${key}">${label}
    <input id="${id}-${key}" name="${key}" type="number" value="${value}" inputmode="decimal" ${attributes}>
  </label>`;
}

function siteForm(id, title) {
  const state = sites[id];
  const confirmation = (key, label, options = values.confirmation) =>
    selectField(id, key, label, Object.entries(options), state[key]);
  const demandLabel = state.type === 'expansion' ? 'Tillkommande effektbehov (MW)' : 'Begärd effekt (MW)';
  const capacityLabel = state.type === 'expansion' ? 'Extra kapacitet enligt nätägaren (MW)' : 'Kapacitetsuppgift från nätägaren (MW)';

  return `<form id="site-${id}" class="card assessment-form" data-site="${id}" aria-label="${title}" autocomplete="off">
    <div class="card-head">
      <h2>${title}</h2>
      ${id === 'main' && route === 'plats' ? '<button type="button" class="button" data-example>Ladda räkneexempel</button>' : ''}
    </div>
    ${state.example ? '<p class="notice">Formuläret innehåller simulerade uppgifter från räkneexemplet.</p>' : ''}
    <div class="fields">
      ${selectField(id, 'county', 'Län', sortedCounties.map(county => [county.code, county.name]), state.county)}
      ${selectField(id, 'municipality', 'Kommun', [['', 'Välj kommun'], ...sortedCities.filter(city => city.code.startsWith(state.county)).map(city => [city.code, city.name])], state.municipality)}
    </div>
    ${selectField(id, 'type', 'Typ av ärende', Object.entries(values.type), state.type)}
    <fieldset class="group stack"><legend>Elnät</legend>
      <div class="fields">
        ${numberField(id, 'demand', demandLabel, state.demand, 'min="0.1" max="1000" step="0.1" placeholder="Ange MW"')}
        ${numberField(id, 'capacity', capacityLabel, state.capacity, 'min="0" step="0.1" placeholder="Om känt"')}
      </div>
      <label class="field" for="${id}-power-slider">Prova effektbehov
        <input type="range" id="${id}-power-slider" data-power-slider min="1" max="300" step="1" value="${state.demand || 1}" aria-describedby="${id}-power-help">
        <span class="field-help" id="${id}-power-help">Spannet på reglaget är 1–300 MW. Högre värden kan anges i fältet ovan.</span>
      </label>
    </fieldset>
    <fieldset class="group stack"><legend>Spillvärme och elens ursprung</legend>
      <div class="fields">
        ${confirmation('nearby', 'Fjärrvärmenät i närheten')}
        ${confirmation('heatAgreement', 'Avtal om att leverera spillvärme')}
      </div>
      ${confirmation('renewable', 'Avtal om ny förnybar elproduktion')}
    </fieldset>
    <fieldset class="group stack"><legend>Vatten och kylning</legend>
      ${confirmation('cooling', 'Kylmetod', values.cooling)}
      <div class="fields">
        ${numberField(id, 'waterUse', 'Vattenbehov (m³/år)', state.waterUse, 'min="0" step="any" placeholder="Om känt"')}
        ${confirmation('waterAvailability', 'Tillgång till vatten', values.water)}
      </div>
    </fieldset>
  </form>`;
}

function assessmentMarkup(state) {
  const result = evaluate(state);
  return `<div class="assessment-head">
    <div><h2>Bedömning</h2><p>Förenklad modell för att identifiera frågor att följa upp.</p></div>
    <div class="points ${result.tone}"><small>${result.caption}</small><strong>${result.summary}</strong></div>
  </div>
  ${result.rows.map(row => `<div class="assessment-item">${pill(row.score)}
    <div><h3>${row.label}</h3><p>${row.explanation}</p></div>
  </div>`).join('')}`;
}

function questionsMarkup(state) {
  return `<ol class="questions">${questions(state).map(question => `<li>${question}</li>`).join('')}</ol>`;
}

function locationTitle(state) {
  return citiesByCode.get(state.municipality)?.name ?? countiesByCode.get(state.county).name;
}

function inputSummary(state) {
  const display = (number, unit) => number === '' ? 'Uppgift saknas' : `${formatNumber(Number(number))} ${unit}`;
  return [
    ['Typ av ärende', values.type[state.type]],
    [state.type === 'expansion' ? 'Tillkommande effektbehov' : 'Begärd effekt', display(state.demand, 'MW')],
    ['Kapacitetsuppgift från nätägaren', display(state.capacity, 'MW')],
    ['Fjärrvärmenät i närheten', values.confirmation[state.nearby]],
    ['Avtal om spillvärme', values.confirmation[state.heatAgreement]],
    ['Avtal om ny förnybar produktion', values.confirmation[state.renewable]],
    ['Kylmetod', values.cooling[state.cooling]],
    ['Vattenbehov', display(state.waterUse, 'm³/år')],
    ['Tillgång till vatten', values.water[state.waterAvailability]]
  ];
}

function printMarkup(state) {
  const result = evaluate(state);
  return `<h1>Underlag för en datacenterförfrågan</h1>
    <p><strong>${locationTitle(state)}</strong> · Datacenterkollen</p>
    <p>Prototyp · förenklad modell och användarens angivna uppgifter.${state.example ? ' Formuläret innehåller fiktiva exempelvärden.' : ''}</p>
    <h2>Förfrågan</h2>
    <dl>${inputSummary(state).map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>
    <h2>Bedömning</h2>
    <p><strong>${result.summary}</strong> · ${result.caption}</p>
    <ul>${result.rows.map(row => `<li><strong>${row.label} (${scale[row.score].label})</strong>. ${row.explanation}</li>`).join('')}</ul>
    <h2>Frågor till exploatören</h2>
    ${questionsMarkup(state)}`;
}

function renderAssessment() {
  app.innerHTML = `<section class="hero assessment-hero">
    <a class="back" href="${createUrl('oversikt')}" data-nav="oversikt">Tillbaka till översikten</a>
    <h1>Platsbedömning av en datacenterförfrågan</h1>
    <p>Fyll i det ni vet om förfrågan. Bedömningen uppdateras när ni fyller i formuläret.</p>
  </section>
  <div class="assessment-grid">
    ${siteForm('main', 'Om förfrågan')}
    <div class="stack">
      <section class="card" id="result-main" aria-live="polite">${assessmentMarkup(sites.main)}</section>
      <section class="card">
        <h2>Frågor att ställa till exploatören</h2>
        <div id="question-list">${questionsMarkup(sites.main)}</div>
      </section>
      <div class="actions">
        <button type="button" class="button primary" data-print>Spara underlag som PDF</button>
        <a class="button" href="${createUrl('jamforelse')}" data-nav="jamforelse">Jämför med annan plats</a>
      </div>
    </div>
  </div>
  <section class="print-content"></section>`;
}

function renderComparison() {
  sites.other ??= { ...blankSite(sites.main.county), demand: sites.main.demand, type: sites.main.type, cooling: sites.main.cooling, example: sites.main.example };
  app.innerHTML = `<section class="hero">
    <a class="back" href="${createUrl('plats')}" data-nav="plats">Tillbaka till platsbedömningen</a>
    <h1>Jämför två platser</h1>
    <p>Välj en andra kommun eller ett annat län och fyll i uppgifterna för den platsen. Använd samma effektbehov om ni jämför två lägen för samma förfrågan.</p>
  </section>
  <div class="comparison">
    ${[['main', 'Första platsen'], ['other', 'Andra platsen']].map(([id, label]) => `<div class="stack">
      <section class="card" id="result-${id}" aria-live="polite">${assessmentMarkup(sites[id])}</section>
      ${siteForm(id, label)}
    </div>`).join('')}
  </div>`;
}

function renderAbout() {
  app.innerHTML = `<section class="hero">
    <h1>Om datan</h1>
    <p>Datacenterkollen visar hur en kommun kan samla underlag och formulera frågor inför etablering eller utbyggnad. Kartan och platsbedömningen har olika uppgiftskällor.</p>
  </section>
  <div class="about">
    <section class="card">
      <h2>Sverigekartan</h2>
      <p>SCB:s förenklade gränser täcker landets 21 län. Sökningen bygger på SCB:s kommunregister i samma datamängd och omfattar 290 kommuner. <a href="https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/">SCB:s digitala gränser (CC0)</a></p>
      <p>Statusvärdena i kartlagren är fiktiva. Grått betyder att uppgift saknas för lagret. Länsgränser och nätområden är olika geografiska indelningar.</p>
      <h3>Källor att använda i ett verkligt ärende</h3>
      <ul>
        <li>Berört nätföretag för effekt, anslutningspunkt och tid. Svenska kraftnäts kapacitetskarta ger en översikt på stamnätsnivå. <a href="https://www.svk.se/kapacitetskarta">Kapacitetskartan</a></li>
        <li>Kommunen, länsstyrelsen och nätföretaget för andra planerade etableringar.</li>
        <li>Lokalt energibolag eller annan värmemottagare för värmebehov, leveransvillkor och mottagningskapacitet.</li>
      </ul>
    </section>
    <section class="card">
      <h2>Platsbedömningen</h2>
      <p>Formuläret bedömer de uppgifter ni matar in. Kartans simulerade värden förs inte över till formuläret.</p>
      <p>Modellen ger två poäng för gynnsam, en för delvis och noll för ogynnsam. Saknade uppgifter ger ingen bedömning. En totalsumma visas först när alla fyra områden kan bedömas. Ett ogynnsamt område markeras som hinder att utreda även om övriga områden får poäng.</p>
      <p>Om ni vill kontrollera hur energi, PUE, vatten och återanvändning av värme definieras kan ni läsa EU:s rapporteringsindikatorer. <a href="https://eur-lex.europa.eu/eli/reg_del/2024/1364/oj?locale=sv">Delegerad förordning 2024/1364</a></p>
      <p>Formulärvärden finns kvar i den öppna fliken under navigering. När fliken laddas om återställs värdena.</p>
    </section>
  </div>
  <p class="footnote">Utformning efter projektgruppens skisser [Amir]. Poänglogik och räkneexempel är designförslag [Antagande]. <a href="demo.html">Tidigare prototyp med tre fiktiva ärenden</a></p>`;
}

function render(focusHeading = false) {
  mapResize?.disconnect();
  const pages = { oversikt: renderOverview, plats: renderAssessment, jamforelse: renderComparison, data: renderAbout };
  pages[route]();
  document.title = `Datacenterkollen · ${views[route]}`;
  document.querySelectorAll('.mast [data-nav]').forEach(link => {
    const selected = link.dataset.nav === (route === 'jamforelse' ? 'plats' : route);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (focusHeading) {
    const heading = app.querySelector('h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function updateResult(id) {
  const state = sites[id];
  document.querySelector(`#result-${id}`).innerHTML = assessmentMarkup(state);
  const questionsSection = document.querySelector('#question-list');
  if (questionsSection) questionsSection.innerHTML = questionsMarkup(state);
}

function saveInput(element, id) {
  if (!element.name && !element.hasAttribute('data-power-slider')) return;
  if (element.hasAttribute('data-power-slider')) {
    sites[id].demand = element.value;
    document.querySelector(`#${id}-demand`).value = element.value;
  } else {
    const validity = element.validity;
    sites[id][element.name] = validity && !validity.valid ? '' : element.value;
    if (element.name === 'demand' && sites[id].demand) {
      document.querySelector(`#${id}-power-slider`).value = sites[id].demand;
    }
  }
  updateResult(id);
}

document.addEventListener('click', event => {
  const navigation = event.target.closest('a[data-nav]');
  if (navigation && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(navigation.dataset.nav);
    return;
  }
  const layerButton = event.target.closest('button[data-layer]');
  if (layerButton) {
    activeLayer = layerButton.dataset.layer;
    app.querySelector('#map-title').textContent = `${layers.find(layer => layer.key === activeLayer).title} per län`;
    app.querySelectorAll('button[data-layer]').forEach(button => button.setAttribute('aria-pressed', button === layerButton));
    drawMap();
  } else if (event.target.closest('[data-example]')) {
    const current = sites.main;
    sites.main = { ...exampleSite(current.county, current.municipality), type: current.type };
    render();
    app.querySelector('[data-example]').focus();
  } else if (event.target.closest('[data-print]')) {
    app.querySelector('.print-content').innerHTML = printMarkup(sites.main);
    window.print();
  }
});

app.addEventListener('input', event => {
  const form = event.target.closest('form[data-site]');
  if (form && event.target instanceof HTMLInputElement) saveInput(event.target, form.dataset.site);
});

app.addEventListener('change', event => {
  const element = event.target;
  if (element.id === 'county-select') {
    updateCounty(element.value, element.value === countyCode ? municipalityCode : '', true);
    return;
  }
  const form = element.closest('form[data-site]');
  if (!form || !(element instanceof HTMLSelectElement)) return;
  const id = form.dataset.site;
  const state = sites[id];
  if (element.name === 'county' || element.name === 'municipality' || element.name === 'type') {
    if (element.name === 'county') sites[id] = setSiteLocation(state, element.value);
    if (element.name === 'municipality') sites[id] = setSiteLocation(state, state.county, element.value);
    if (element.name === 'type') {
      sites[id] = { ...state, type: element.value, demand: '', capacity: '' };
    }
    if (id === 'main') {
      countyCode = sites.main.county;
      municipalityCode = sites.main.municipality;
      history.replaceState(null, '', createUrl(route));
    }
    render();
    document.getElementById(element.id).focus();
    return;
  }
  saveInput(element, id);
});

app.addEventListener('submit', event => event.preventDefault());
window.addEventListener('beforeprint', () => {
  const output = app.querySelector('.print-content');
  if (output) output.innerHTML = printMarkup(sites.main);
});
window.addEventListener('popstate', () => {
  const target = readLocation();
  route = target.route;
  if (route === 'oversikt') {
    countyCode = target.county;
    municipalityCode = target.municipality;
  }
  if (route === 'plats' || route === 'jamforelse') {
    sites.main = setSiteLocation(sites.main, target.county, target.municipality);
  }
  render();
});

if (initial.legacy) {
  const previous = new URL('demo.html', location.href);
  previous.search = location.search;
  location.replace(previous);
} else {
  render();
}
