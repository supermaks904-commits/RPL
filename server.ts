/**
 * Вирт РПЛ — сервер приложения с поддержкой логотипов команд,
 * симуляции матчей через LLM/фоновый генератор, Live SSE и турнирной таблицы.
 */
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getTeamLogo, getTeamColors, getCompetitionLogo } from './src/logos.ts';
import { LEAGUE_REGULATIONS, getTeamZoneClass } from './src/rules.ts';
import { getTeamCoach, computeCoachSynergy, Coach } from './src/coaches.ts';
import { computeMatchRatings, getMatchMotm, buildTeamOfRound, buildTeamOfMonth } from './src/awards.ts';
import { initCup2026, recalculateCupGroups } from './src/cup2026.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MDIR = path.join(DATA_DIR, 'matches');
fs.mkdirSync(MDIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');

let SYS_DEFAULT = '';
try {
  SYS_DEFAULT = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
} catch {
  SYS_DEFAULT = 'Ты — футбольный комментатор и спортивный симулятор чемпионата России по футболу (Вирт РПЛ). Сгенерируй реалистичный отрезок матча в формате JSON.';
}

/* ───────── утилиты ───────── */
const uid = () => crypto.randomBytes(5).toString('hex');
const mkCode = () => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[crypto.randomInt(a.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const norm = (s: any) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 864e5);
const at = (f: any) => new Date(`${f.date}T${f.time}:00`);
const esc = (s: any) => String(s == null ? '' : s).replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
function rng(seed: any) {
  let a = 0;
  for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function km(a: any, b: any) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, t = (x: number) => x * Math.PI / 180;
  const dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) / 10) * 10;
}

/* ───────── начальные данные ───────── */
/* ───────── начальные данные (Сезон 2026/2027) ───────── */
const RPL: [string, string, number, number, string][] = [
  ['Зенит', 'Санкт-Петербург', 59.95, 30.32, 'Газпром Арена'],
  ['Краснодар', 'Краснодар', 45.04, 38.97, 'Парк Краснодар'],
  ['Локомотив', 'Москва', 55.81, 37.74, 'РЖД Арена'],
  ['Спартак', 'Москва', 55.82, 37.44, 'Лукойл Арена'],
  ['ЦСКА', 'Москва', 55.79, 37.53, 'ВЭБ Арена'],
  ['Балтика', 'Калининград', 54.71, 20.51, 'Ростех Арена'],
  ['Динамо Москва', 'Москва', 55.79, 37.56, 'ВТБ Арена'],
  ['Рубин', 'Казань', 55.79, 49.12, 'Ак Барс Арена'],
  ['Ахмат', 'Грозный', 43.32, 45.69, 'Ахмат-Арена'],
  ['Ростов', 'Ростов-на-Дону', 47.22, 39.72, 'Ростов Арена'],
  ['Крылья Советов', 'Самара', 53.2, 50.15, 'Солидарность Арена'],
  ['Оренбург', 'Оренбург', 51.77, 55.1, 'Газовик'],
  ['Акрон', 'Тольятти', 53.5, 49.42, 'Кристалл'],
  ['Динамо Махачкала', 'Махачкала', 42.98, 47.5, 'Анжи-Арена'],
  ['Родина', 'Москва', 55.75, 37.61, 'Спартаковец'],
  ['Факел', 'Воронеж', 51.67, 39.18, 'Факел Арена']
];

const FNL_TEAMS: [string, string, number, number, string][] = [
  ['Арсенал Тула', 'Тула', 54.19, 37.61, 'Арсенал'],
  ['Велес', 'Москва', 55.7, 37.6, 'Спартаковец'],
  ['Волга Ульяновск', 'Ульяновск', 54.32, 48.39, 'Труд'],
  ['Енисей', 'Красноярск', 56.01, 92.87, 'Центральный'],
  ['КАМАЗ', 'Набережные Челны', 55.74, 52.41, 'КАМАЗ'],
  ['Ленинградец', 'Санкт-Петербург', 59.93, 30.3, 'Рощино Арена'],
  ['Нефтехимик', 'Нижнекамск', 55.64, 51.82, 'Нефтехимик'],
  ['Пари НН', 'Нижний Новгород', 56.33, 44.0, 'Стадион Нижний Новгород'],
  ['Ротор', 'Волгоград', 48.73, 44.55, 'Волгоград Арена'],
  ['СКА-Хабаровск', 'Хабаровск', 48.48, 135.07, 'Стадион им. Ленина'],
  ['Сочи', 'Сочи', 43.6, 39.73, 'Фишт'],
  ['Спартак Кострома', 'Кострома', 57.77, 40.93, 'Урожай'],
  ['Текстильщик', 'Иваново', 57.0, 40.97, 'Текстильщик'],
  ['Торпедо Москва', 'Москва', 55.71, 37.65, 'БСА Лужники'],
  ['Урал', 'Екатеринбург', 56.83, 60.57, 'Екатеринбург Арена'],
  ['Уфа', 'Уфа', 54.74, 55.97, 'Нефтяник'],
  ['Челябинск', 'Челябинск', 55.16, 61.4, 'Центральный'],
  ['Шинник', 'Ярославль', 57.63, 39.87, 'Шинник']
];

const LOWER: Record<string, string[]> = {
  '2la_gold': [
    'Сокол', 'Динамо Брянск', 'Алания', 'Родина-2', 'Динамо Киров',
    'Амкар', 'Тюмень', 'Динамо Владивосток', 'Сибирь', 'Спартак Владикавказ'
  ],
  '2la_silver': [
    'Калуга', 'Торпедо Миасс', 'Волгарь', 'Зенит-2', 'Ротор-2',
    'Урал-2', 'Крылья Советов-2', 'Балтика-2', 'Родина-3', 'Динамо Ставрополь'
  ],
  '2lb_1': [
    'Севастополь', 'Нарт Черкесск', 'Победа Хасавюрт', 'Ростов-2', 'Дружба Майкоп',
    'Астрахань', 'Рубин Ялта', 'Ангушт', 'Спартак-Нальчик', 'Динамо-2 Махачкала',
    'Заря Луганск', 'Кызылташ', 'Нефтяник Ахтырский', 'ПСК Динская', 'Чайка-М', 'Шахтер Донецк'
  ],
  '2lb_2': [
    'Муром', 'Динамо Вологда', 'Иркутск', 'Спартак-2', 'Балтика-БФУ',
    'Тверь', 'Торпедо Владимир', 'Череповец', 'Чертаново', 'Звезда',
    'Луки-Энергия', 'Космос Долгопрудный', 'Енисей-2', 'Динамо СПб', 'Искра Смоленск'
  ],
  '2lb_3': [
    'Авангард Курск', 'Салют Белгород', 'Спартак Тамбов', 'Рязань', 'Металлург Липецк',
    'Орел', 'Арсенал-2', 'Родина-М', 'Зенит Пенза', 'СКА-Хабаровск-2',
    'Ротор-2', 'Строгино', 'Квант Обнинск', 'Сатурн Раменское', 'Волна', 'Шумбрат'
  ],
  '2lb_4': [
    'Химик', 'КДВ Томск', 'Оренбург-2', 'Динамо Барнаул', 'Рубин-2',
    'Крылья Советов-2', 'Челябинск-2', 'Акрон-2', 'Урал-2', 'Носта',
    'Легион', 'Ижевск'
  ],
  'media': [
    'Амкал', '2Drots', 'Броуки (Brokeboys)', 'ФК 10', 'СиндЕкат',
    'Банка', 'Lit Energy', 'Апсны', 'Prime Squad', 'СКА Ростов',
    'Эгриси', 'Народная Команда', 'Матч ТВ', 'Fight Nights', 'Rocket Team', 'Чисто Питер'
  ]
};

const COMPS = [
  { id: 'rpl', name: 'РПЛ', type: 'league', tier: 1, level: '1-й уровень (16 команд)', logo: '/logos/leagues/rpl.svg' },
  { id: 'cup', name: 'Кубок России', type: 'cup', level: 'Национальный кубок', logo: '/logos/leagues/cup.svg' },
  { id: 'fnl', name: 'Первая лига', type: 'league', tier: 2, level: '2-й уровень (18 команд)', logo: '/logos/leagues/fnl.svg' },
  { id: '2la_gold', name: 'Вторая лига А · Золото', type: 'league', tier: 3, cat: '2la', level: '3-й уровень (10 команд)', logo: '/logos/leagues/2la.svg' },
  { id: '2la_silver', name: 'Вторая лига А · Серебро', type: 'league', tier: 3, cat: '2la', level: '3-й уровень (10 команд)', logo: '/logos/leagues/2la.svg' },
  { id: '2lb_1', name: 'Вторая лига Б · Группа 1 (Юг)', type: 'league', tier: 4, cat: '2lb', level: '4-й уровень (16 команд)', logo: '/logos/leagues/2lb.svg' },
  { id: '2lb_2', name: 'Вторая лига Б · Группа 2 (Запад)', type: 'league', tier: 4, cat: '2lb', level: '4-й уровень (15 команд)', logo: '/logos/leagues/2lb.svg' },
  { id: '2lb_3', name: 'Вторая лига Б · Группа 3 (Центр)', type: 'league', tier: 4, cat: '2lb', level: '4-й уровень (16 команд)', logo: '/logos/leagues/2lb.svg' },
  { id: '2lb_4', name: 'Вторая лига Б · Группа 4 (Урал)', type: 'league', tier: 4, cat: '2lb', level: '4-й уровень (12 команд)', logo: '/logos/leagues/2lb.svg' },
  { id: 'media', name: 'Медиалига (7-й сезон)', type: 'league', tier: 5, level: 'Медийный футбол (16 команд)', logo: '/logos/leagues/media.svg' }
];

const DERBIES = [
  ['Спартак', 'ЦСКА', 'Дерби всея Руси', 'Главное противостояние страны, максимальный накал и давление трибун.'],
  ['Спартак', 'Динамо Москва', 'Старейшее московское дерби', 'Старейшее принципиальное соперничество.'],
  ['Спартак', 'Локомотив', 'Московское дерби', 'Принципиальный матч, всегда жарко.'],
  ['Спартак', 'Родина', 'Московское дерби', 'Амбициозный новичок столицы бросает вызов народной команде.'],
  ['ЦСКА', 'Динамо Москва', 'Братское дерби', 'Историческое столичное дерби.'],
  ['ЦСКА', 'Локомотив', 'Московское дерби', 'Игра армейцев и железнодорожников — всегда на нерве.'],
  ['Динамо Москва', 'Локомотив', 'Московское дерби', 'Борьба за московский приоритет.'],
  ['Динамо Москва', 'Родина', 'Московское дерби', 'Столичное дерби двух поколений.'],
  ['Локомотив', 'Родина', 'Московское дерби', 'Борьба московских клубов.'],
  ['Зенит', 'Спартак', 'Битва двух столиц', 'Главное противостояние Петербурга и Москвы.'],
  ['Зенит', 'ЦСКА', 'Принципиальное противостояние', 'Исторически острые матчи Петербурга и Москвы.'],
  ['Ростов', 'Краснодар', 'Южное дерби', 'Главная битва за юг России.'],
  ['Ахмат', 'Динамо Махачкала', 'Кавказское дерби', 'Региональная принципиальность и эмоции.'],
  ['Рубин', 'Крылья Советов', 'Волжское дерби', 'Волжское дерби Татарстана и Самарской области.'],
  ['Факел', 'Спартак', 'Огненное противостояние', 'Невероятная поддержка воронежских трибун.']
];

function seed() {
  const d: any = {
    settings: {
      season: '2026/27',
      secPerMin: 4,
      breakSec: 20,
      chunks: 2,
      auto: false,
      squadMax: 25,
      grounding: false,
      tgToken: '',
      tgChat: '',
      siteUrl: '',
      systemPrompt: '',
      keys: {},
      models: {},
      adminCode: mkCode()
    },
    comps: COMPS,
    teams: [],
    players: [],
    squads: {},
    lineups: {},
    tactics: {},
    fixtures: [],
    derbies: [],
    transfers: [],
    sessions: {},
    llmlog: [],
    cup: null
  };
  for (const [name, city, lat, lon, stadium] of RPL) {
    d.teams.push({ id: uid(), name, comp: 'rpl', city, lat, lon, stadium, code: mkCode(), logo: getTeamLogo(name, null, 'rpl') });
  }
  for (const [name, city, lat, lon, stadium] of FNL_TEAMS) {
    d.teams.push({ id: uid(), name, comp: 'fnl', city, lat, lon, stadium, code: mkCode(), logo: getTeamLogo(name, null, 'fnl') });
  }
  for (const c of Object.keys(LOWER)) {
    for (const name of LOWER[c]) {
      d.teams.push({ id: uid(), name, comp: c, city: '', lat: null, lon: null, stadium: '', code: '', logo: getTeamLogo(name, null, c) });
    }
  }
  const T = (n: string) => d.teams.find((t: any) => t.name === n);
  for (const [a, b, name, note] of DERBIES) {
    if (T(a) && T(b)) d.derbies.push({ id: uid(), a: T(a).id, b: T(b).id, name, note });
  }
  return d;
}

let db: any;
function load() {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    db = seed();
  }
  const def = seed();
  for (const k of Object.keys(def.settings)) {
    if (db.settings[k] === undefined) db.settings[k] = def.settings[k];
  }
  for (const k of ['comps', 'teams', 'players', 'fixtures', 'derbies', 'transfers', 'llmlog']) {
    if (!db[k]) db[k] = [];
  }
  for (const k of ['squads', 'lineups', 'tactics', 'sessions']) {
    if (!db[k]) db[k] = {};
  }

  // Синхронизируем список соревнований
  db.comps = COMPS;

  // Карта принадлежности команд к лигам по новому регламенту 2026/2027
  const wantedMap = new Map<string, { comp: string; city?: string; stadium?: string; lat?: number | null; lon?: number | null }>();
  for (const [name, city, lat, lon, stadium] of RPL) wantedMap.set(name, { comp: 'rpl', city, stadium, lat, lon });
  for (const [name, city, lat, lon, stadium] of FNL_TEAMS) wantedMap.set(name, { comp: 'fnl', city, stadium, lat, lon });
  for (const c of Object.keys(LOWER)) {
    for (const name of LOWER[c]) wantedMap.set(name, { comp: c });
  }

  // Обновляем лиги и данные существующих команд
  for (const t of db.teams) {
    if (wantedMap.has(t.name)) {
      const w = wantedMap.get(t.name)!;
      t.comp = w.comp;
      if (w.city) t.city = w.city;
      if (w.stadium) t.stadium = w.stadium;
      if (w.lat != null) t.lat = w.lat;
      if (w.lon != null) t.lon = w.lon;
    }
    t.logo = getTeamLogo(t.name, t.logo, t.comp);
  }

  // Добавляем новые команды в базу
  for (const [name, w] of wantedMap.entries()) {
    if (!db.teams.some((t: any) => t.name === name)) {
      db.teams.push({
        id: uid(),
        name,
        comp: w.comp,
        city: w.city || '',
        lat: w.lat ?? null,
        lon: w.lon ?? null,
        stadium: w.stadium || '',
        code: (w.comp === 'rpl' || w.comp === 'fnl') ? mkCode() : '',
        logo: getTeamLogo(name, null, w.comp)
      });
    }
  }

  // Обновляем дерби
  const T = (n: string) => db.teams.find((t: any) => t.name === n);
  db.derbies = [];
  for (const [a, b, name, note] of DERBIES) {
    if (T(a) && T(b)) db.derbies.push({ id: uid(), a: T(a).id, b: T(b).id, name, note });
  }

  // Инициализируем тренеров и актуальную структуру Кубка России 2026/2027
  if (!db.coaches) db.coaches = {};
  if (!db.cupState2026 || !db.fixtures.some((f: any) => f.comp === 'cup' && f.cupPath)) {
    const rplTeams = db.teams.filter((t: any) => t.comp === 'rpl');
    const fnlTeams = db.teams.filter((t: any) => t.comp === 'fnl');
    const secondLeagueTeams = db.teams.filter((t: any) => t.comp.startsWith('2la') || t.comp.startsWith('2lb'));
    const mediaTeams = db.teams.filter((t: any) => t.comp === 'media');
    const { cupState, fixtures: cupFixtures } = initCup2026(S(), rplTeams, fnlTeams, secondLeagueTeams, mediaTeams, uid);
    db.cupState2026 = cupState;
    db.fixtures = db.fixtures.filter((f: any) => f.comp !== 'cup').concat(cupFixtures);
  } else {
    recalculateCupGroups(db.cupState2026, db.fixtures);
  }

  save();
}

let saveT: NodeJS.Timeout | null = null;
function save() {
  if (saveT) return;
  saveT = setTimeout(saveNow, 250);
}
function saveNow() {
  saveT = null;
  try {
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  } catch (e: any) {
    console.error('save:', e.message);
  }
}

const mcache = new Map<string, any>();
const getMatch = (id: string) => {
  if (mcache.has(id)) return mcache.get(id);
  try {
    const m = JSON.parse(fs.readFileSync(path.join(MDIR, id + '.json'), 'utf8'));
    mcache.set(id, m);
    if (mcache.size > 40) mcache.delete(mcache.keys().next().value!);
    return m;
  } catch {
    return null;
  }
};
const putMatch = (id: string, m: any) => {
  mcache.set(id, m);
  fs.writeFileSync(path.join(MDIR, id + '.json'), JSON.stringify(m));
};

/* ───────── доступ к данным ───────── */
const S = () => db.settings.season;
const team = (id: string) => db.teams.find((t: any) => t.id === id);
const tn = (id: string) => team(id)?.name || '?';
const teamLogo = (id: string) => {
  const t = team(id);
  if (!t) return getTeamLogo('?');
  const official = getTeamLogo(t.name, null, t.comp);
  return official.startsWith('/assets/') ? official : (t.logo || official);
};
const player = (id: string) => db.players.find((p: any) => p.id === id);
const fx = (id: string) => db.fixtures.find((f: any) => f.id === id);
const compOf = (id: string) => db.comps.find((c: any) => c.id === id);
const seasonFx = () => db.fixtures.filter((f: any) => f.season === S());
const GROUP: Record<string, string> = { ВР: 'gk', ЦЗ: 'def', ЛЗ: 'def', ПЗ: 'def', ОП: 'mid', ЦП: 'mid', АП: 'mid', ЛВ: 'fwd', ПВ: 'fwd', ЦФ: 'fwd' };
const POSES = Object.keys(GROUP);
function squadOf(tid: string) {
  const ids = db.squads[tid];
  return (ids ? ids.map(player) : db.players.filter((p: any) => p.teamId === tid)).filter(Boolean);
}
function isAvail(p: any, date: string) {
  if (!p) return false;
  if (p.banLeft > 0) return false;
  if (p.out && p.out.until >= date) return false;
  return true;
}
function age(p: any, date: string) {
  const y = parseInt(String(p.born || '').slice(0, 4));
  return y ? (+date.slice(0, 4) - y) : null;
}
function roundLabel(f: any) {
  if (f.comp === 'cup') {
    const n = seasonFx().filter((x: any) => x.comp === 'cup' && x.round === f.round).length;
    return ({ 16: '1/16 финала', 8: '1/8 финала', 4: '1/4 финала', 2: 'Полуфинал', 1: 'Финал' } as any)[n] || `Раунд ${f.round}`;
  }
  return `${f.round}-й тур`;
}
const compName = (f: any) => compOf(f.comp)?.name || f.comp;
const winnerOf = (f: any) => f.hg > f.ag ? f.home : f.hg < f.ag ? f.away : (f.pen ? (f.pen.winner === 'home' ? f.home : f.away) : null);

/* ───────── таблицы и статистика ───────── */
function table(comp: string, beforeDate?: string) {
  const ids = db.teams.filter((t: any) => t.comp === comp).map((t: any) => t.id);
  const R: Record<string, any> = {};
  ids.forEach((i: string) => {
    const tm = team(i);
    R[i] = {
      id: i,
      name: tn(i),
      logo: teamLogo(i),
      colors: getTeamColors(tm?.name || ''),
      p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: []
    };
  });
  const list = seasonFx().filter((f: any) => f.comp === comp && f.status === 'done' && (!beforeDate || f.date < beforeDate)).sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
  for (const f of list) {
    for (const [t, gf, ga] of [[f.home, f.hg, f.ag], [f.away, f.ag, f.hg]]) {
      const r = R[t];
      if (!r) continue;
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += 3; r.form.push('В'); }
      else if (gf === ga) { r.d++; r.pts++; r.form.push('Н'); }
      else { r.l++; r.form.push('П'); }
    }
  }
  const rows = Object.values(R).sort((a: any, b: any) => b.pts - a.pts || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name));
  rows.forEach((r: any, i: number) => {
    r.pos = i + 1;
    r.gd = r.gf - r.ga;
    r.form = r.form.slice(-5).join('');
    const z = getTeamZoneClass(comp, r.pos, rows.length);
    r.zone = z.zoneClass;
    r.zoneLabel = z.badgeLabel || '';
    r.zoneTooltip = z.tooltip || '';
  });
  return rows;
}

let aggCache: any = null;
function agg() {
  if (aggCache && aggCache.season === S()) return aggCache;
  const P: Record<string, any> = {}, T: Record<string, any> = {};
  const add = (o: any, k: string, v: number) => { o[k] = (o[k] || 0) + v; };
  for (const f of seasonFx()) {
    if (f.status !== 'done' || !f.st) continue;
    for (const [pid, s] of Object.entries<any>(f.st.players)) {
      const o = P[f.comp + '|' + pid] ||= { pid, comp: f.comp, n: s.n, t: s.t, logo: teamLogo(s.t), m: 0 };
      o.m += 1;
      for (const k of ['min', 'g', 'a', 'yc', 'rc', 'tk', 'sv', 'sh', 'xg', 'ff', 'fa', 'cs']) add(o, k, s[k] || 0);
    }
    for (const side of ['home', 'away']) {
      const tid = f[side], s = f.st.teams[side], o = f.st.teams[side === 'home' ? 'away' : 'home'];
      const x = T[f.comp + '|' + tid] ||= { tid, comp: f.comp, logo: teamLogo(tid), m: 0 };
      x.m++;
      for (const k of ['g', 'sh', 'sot', 'xg', 'fo', 'co', 'yc', 'rc', 'tk', 'sv', 'off', 'penF', 'penA', 'refF', 'refA']) add(x, k, s[k] || 0);
      add(x, 'ga', o.g || 0); add(x, 'xga', o.xg || 0); add(x, 'foA', o.fo || 0);
      if (!(o.g > 0)) add(x, 'cs', 1);
    }
  }
  aggCache = { season: S(), P, T };
  return aggCache;
}
const invalidateAgg = () => { aggCache = null; };

/* ───────── LLM ───────── */
function provList() {
  const k = db.settings.keys || {}, m = db.settings.models || {}, L: any[] = [];
  const g = process.env.GEMINI_API_KEY || k.gemini;
  const q = process.env.GROQ_API_KEY || k.groq;
  const o = process.env.OPENROUTER_API_KEY || k.openrouter;
  if (g) L.push({ n: 'gemini', key: g, model: process.env.GEMINI_MODEL || m.gemini || 'gemini-2.5-flash', max: 32000 });
  if (q) L.push({ n: 'groq', key: q, base: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || m.groq || 'openai/gpt-oss-120b', max: 8000 });
  if (o) L.push({ n: 'openrouter', key: o, base: 'https://openrouter.ai/api/v1', model: process.env.OPENROUTER_MODEL || m.openrouter || 'openrouter/free', max: 8000 });
  return L;
}
const hasLLM = () => provList().length > 0;
function httpErr(status: number, body: any) {
  return Object.assign(new Error(`HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`), { status });
}
async function callProv(p: any, sys: string, user: string, o: any) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 170000);
  try {
    if (p.n === 'gemini') {
      const body: any = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: o.temp, maxOutputTokens: Math.min(o.max, p.max) }
      };
      if (o.grounded) body.tools = [{ google_search: {} }];
      else if (o.json) body.generationConfig.responseMimeType = 'application/json';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${p.key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw httpErr(r.status, j);
      return (j.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || '').join('');
    }
    const body: any = { model: p.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: o.temp, max_tokens: Math.min(o.max, p.max) };
    if (o.json) body.response_format = { type: 'json_object' };
    const r = await fetch(p.base + '/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key }, body: JSON.stringify(body), signal: ctl.signal
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw httpErr(r.status, j);
    return j.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(to);
  }
}
function llog(e: any) {
  db.llmlog.push({ ts: Date.now(), ...e });
  if (db.llmlog.length > 200) db.llmlog.shift();
}
async function llm(sys: string, user: string, { json = true, task = '', temp = 0.9, max = 16000, grounded = false } = {}) {
  const L = provList();
  if (!L.length) throw Object.assign(new Error('Нет ключей нейросети'), { noLLM: true });
  let last: any;
  for (const p of L) {
    for (let a = 0; a < 2; a++) {
      const t0 = Date.now();
      try {
        const text = await callProv(p, sys, user, { json, temp, max, grounded });
        if (!text.trim()) throw new Error('пустой ответ');
        llog({ task, p: p.n, ok: 1, ms: Date.now() - t0 });
        return text;
      } catch (e: any) {
        last = e;
        llog({ task, p: p.n, ok: 0, ms: Date.now() - t0, err: e.message.slice(0, 160) });
        if (e.status === 429) { await sleep(2500); break; }
        if (e.status >= 500 || e.name === 'AbortError') await sleep(1500);
        else if (e.status) break;
      }
    }
  }
  throw last;
}
function parseJSON(t: any) {
  t = String(t).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(t); } catch { }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch { }
  throw new Error('нейросеть вернула не-JSON');
}
const llmJSON = async (s: string, u: string, o?: any) => parseJSON(await llm(s, u, o));

/* ───────── карточки игроков ───────── */
const CARD_SYS = `Ты — футбольный скаут-аналитик для симулятора. По имени игрока верни карточку в JSON. Используй только то, что знаешь достоверно; если игрока не знаешь — верни {"found":false}. Не выдумывай. Не пиши о личной жизни, здоровье, скандалах — только спорт.
Формат одного игрока: {"found":true,"name":"Имя Фамилия по-русски","pos":"одна из: ${POSES.join(', ')}","born":"YYYY-MM-DD или YYYY","nation":"","realClub":"","style":"как играет, любимые действия на поле, 1–2 предложения","achievements":["главные достижения"],"stats2y":"реальная статистика за 2 последних сезона кратко","form":"последние результаты и тренд","character":"темперамент на поле: спокойный, вспыльчивый, лидер, легко провоцируется и т.п.","news":"спортивные новости за год кратко"}
Для списка имён верни {"players":[...]} в том же порядке.`;

function cardFrom(c: any, extra: any = {}) {
  return {
    id: uid(), teamId: extra.teamId || null, name: String(c.name || extra.name || '').trim(),
    pos: POSES.includes(c.pos) ? c.pos : (extra.pos || 'ЦП'),
    born: c.born || '', nation: c.nation || '', realClub: c.realClub || '',
    style: c.style || '', achievements: Array.isArray(c.achievements) ? c.achievements : (c.achievements ? [c.achievements] : []),
    stats2y: c.stats2y || '', form: c.form || '', character: c.character || '', news: c.news || '',
    verified: !!c.__llm, updatedAt: new Date().toISOString(), out: null, banLeft: 0, seasonYC: 0
  };
}
const findPlayerByName = (n: string) => {
  const k = norm(n);
  return db.players.find((p: any) => norm(p.name) === k);
};
async function createPlayers(names: string[], teamId: string | null, hint?: string) {
  const out: any[] = []; const todo: string[] = [];
  for (const raw of names) {
    const nm = String(raw).trim();
    if (!nm) continue;
    const ex = findPlayerByName(nm);
    if (ex) out.push(ex);
    else todo.push(nm);
  }
  let cards: any[] = [];
  if (todo.length && hasLLM()) {
    try {
      const r = await llmJSON(CARD_SYS, `Игроки: ${todo.map((n, i) => `${i + 1}. ${n}`).join('; ')}${hint ? `. Подсказка: ${hint}` : ''}`, { task: 'card', temp: 0.3, max: 8000, grounded: !!db.settings.grounding && provList()[0]?.n === 'gemini' });
      cards = r.players || (r.found !== undefined ? [r] : []);
    } catch (e: any) {
      console.error('card:', e.message);
    }
  }
  todo.forEach((nm, i) => {
    const c = cards[i];
    const p = (c && c.found !== false) ? cardFrom({ ...c, __llm: 1 }, { teamId, name: nm }) : cardFrom({ name: nm, style: 'Данных нет — заполните карточку вручную.' }, { teamId, name: nm });
    if (!p.name) p.name = nm;
    db.players.push(p);
    out.push(p);
  });
  save();
  return out;
}

/* ───────── погода ───────── */
const wcache = new Map<string, string>();
async function weather(tm: any, date: string, time: string) {
  const hour = parseInt((time || '17:00').slice(0, 2));
  const key = [tm?.id, date, hour].join();
  if (wcache.has(key)) return wcache.get(key)!;
  let txt = 'данных о погоде нет — оцени сам по региону и дате; время суток учитывай';
  try {
    if (tm && tm.lat != null) {
      const days = daysBetween(new Date().toISOString().slice(0, 10), date);
      let temp: any, wind: any, rain: any, snow = 0, src: any;
      if (days <= 14) {
        const j: any = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${tm.lat}&longitude=${tm.lon}&hourly=temperature_2m,precipitation,snowfall,wind_speed_10m&start_date=${date}&end_date=${date}&timezone=auto`)).json();
        if (j.hourly) {
          const i = clamp(hour, 0, 23);
          temp = j.hourly.temperature_2m[i];
          wind = j.hourly.wind_speed_10m[i] / 3.6;
          rain = j.hourly.precipitation[i];
          snow = j.hourly.snowfall[i];
          src = 'прогноз';
        }
      }
      if (temp == null) {
        const y = +date.slice(0, 4);
        const res = await Promise.all([1, 2, 3, 4, 5].map(k => fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${tm.lat}&longitude=${tm.lon}&start_date=${y - k}${date.slice(4)}&end_date=${y - k}${date.slice(4)}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`).then(r => r.json()).catch(() => null)));
        const d = res.map((r: any) => r?.daily).filter(Boolean);
        if (d.length) {
          const av = (k: string) => d.reduce((s, x) => s + (x[k]?.[0] || 0), 0) / d.length;
          const mean = av('temperature_2m_mean'), mx = av('temperature_2m_max'), mn = av('temperature_2m_min');
          temp = hour < 17 ? mean + (mx - mean) * 0.7 : mean - (mean - mn) * 0.4;
          wind = av('wind_speed_10m_max') / 3.6 * 0.6;
          rain = av('precipitation_sum') / 6;
          src = 'обычная погода на эту дату по данным прошлых лет';
        }
      }
      if (temp != null) {
        const ppt = rain > 0.2 ? (temp <= 0 || snow > 0 ? 'снег' : 'дождь') : 'без осадков';
        const pitch = temp <= -3 ? 'газон подмёрзший и жёсткий' : (ppt === 'дождь' ? 'газон мокрый, скользкий' : ppt === 'снег' ? 'газон заснежен' : temp >= 28 ? 'газон сухой, жара' : 'газон в норме');
        txt = `около ${Math.round(temp)}°C, ветер ~${Math.round(wind)} м/с, ${ppt}; ${pitch} (${src})`;
      }
    }
  } catch { }
  wcache.set(key, txt);
  return txt;
}

/* ───────── составы ───────── */
function parseFormation(f: string) {
  const n = String(f || '4-3-3').split('-').map(Number).filter(x => x > 0);
  const def = n[0] || 4, fwd = n[n.length - 1] || 3, mid = 10 - def - fwd;
  return { def, mid: Math.max(0, mid), fwd };
}
function autoPick(avail: any[], F: any, used = new Set<string>()) {
  const need: Record<string, number> = { gk: 1, def: F.def, mid: F.mid, fwd: F.fwd }, res: string[] = [];
  for (const g of ['gk', 'def', 'mid', 'fwd']) {
    for (const p of avail) {
      if (res.length >= 11 || used.has(p.id)) continue;
      if (GROUP[p.pos] === g && need[g] > 0) {
        res.push(p.id); used.add(p.id); need[g]--;
      }
    }
  }
  return res;
}
function fixLineup(L: any, tid: string, f: any) {
  const sq = squadOf(tid), ok = new Set(sq.filter((p: any) => isAvail(p, f.date)).map((p: any) => p.id));
  const F = parseFormation(L.formation); const used = new Set<string>();
  const starters: string[] = [];
  for (const id of L.starters || []) {
    if (ok.has(id) && !used.has(id)) { starters.push(id); used.add(id); }
  }
  const hasGK = starters.some(id => player(id)?.pos === 'ВР');
  if (!hasGK) {
    const g = sq.find((p: any) => ok.has(p.id) && p.pos === 'ВР' && !used.has(p.id));
    if (g) {
      if (starters.length >= 11) used.delete(starters.pop()!);
      starters.push(g.id); used.add(g.id);
    }
  }
  const avail = sq.filter((p: any) => ok.has(p.id));
  if (starters.length < 11) {
    for (const id of autoPick(avail.filter((p: any) => !used.has(p.id)), { def: F.def, mid: F.mid, fwd: F.fwd }, used)) starters.push(id);
  }
  for (const p of avail) {
    if (starters.length >= 11) break;
    if (!used.has(p.id)) { starters.push(p.id); used.add(p.id); }
  }
  const bench: string[] = [];
  for (const id of L.bench || []) {
    if (ok.has(id) && !used.has(id) && !bench.includes(id)) bench.push(id);
  }
  for (const p of avail) {
    if (bench.length >= 9) break;
    if (!used.has(p.id) && !bench.includes(p.id)) bench.push(p.id);
  }
  return { formation: L.formation || '4-3-3', starters: starters.slice(0, 11), bench: bench.slice(0, 9), speech: L.speech || '', training: L.training || '' };
}
function getLineup(f: any, tid: string) {
  const own = db.lineups[f.id + ':' + tid];
  const base = own || db.tactics[tid] || { formation: '4-3-3' };
  return { ...fixLineup(base, tid, f), submitted: !!own };
}

/* ───────── контекст матча ───────── */
function motivText(tid: string, f: any) {
  const t = team(tid); const comp = compOf(t.comp); const rows = table(t.comp, f.date); const r = rows.find((x: any) => x.id === tid); const n = rows.length;
  let s = '';
  if (f.comp === 'cup') s += `Кубковый матч, проигравший выбывает из турнира. `;
  if (!r || r.p === 0) return s + `${t.name} (${comp?.name}): сезон только начинается, таблица пока не сложилась.`;
  const lead = rows[0], below = rows[Math.min(n - 1, n - 3)];
  s += `${t.name} (${comp?.name}): ${r.pos}-е место из ${n}, ${r.pts} очк. за ${r.p} матчей, мячи ${r.gf}-${r.ga}, форма: ${r.form || '—'}. `;
  if (r.pos === 1) s += `Лидирует, отрыв от второго места ${r.pts - rows[1].pts} очк. `;
  else s += `Отставание от лидера ${lead.pts - r.pts} очк. `;
  if (r.pos >= n - 2) s += 'В зоне вылета — очки нужны любой ценой. ';
  else if (r.pos >= n - 4) s += `До зоны вылета ${r.pts - below.pts} очк. — спокойствия нет. `;
  else if (r.pos <= 3) s += 'Борется за чемпионство и верх таблицы. ';
  else if (r.pos <= 6) s += 'Борется за еврокубки. ';
  else s += 'Середина таблицы, особых турнирных задач нет, но амбиции и гордость остаются. ';
  return s.trim();
}
function fatText(tid: string, f: any) {
  const prev = seasonFx().filter((x: any) => x.status === 'done' && (x.home === tid || x.away === tid) && x.date < f.date).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 3);
  const lines = prev.map((x: any) => `${daysBetween(x.date, f.date)} дн. назад: ${compName(x)}, ${x.home === tid ? 'дома' : 'в гостях'} против ${tn(x.home === tid ? x.away : x.home)} ${x.hg}:${x.ag}`);
  const nxt = seasonFx().filter((x: any) => x.status === 'scheduled' && x.id !== f.id && (x.home === tid || x.away === tid) && x.date > f.date).sort((a: any, b: any) => a.date.localeCompare(b.date))[0];
  let s = lines.length ? 'Недавние матчи: ' + lines.join('; ') + '.' : 'Недавних официальных матчей нет (начало сезона или долгий перерыв).';
  if (nxt && daysBetween(f.date, nxt.date) <= 4) s += ` Следующий матч уже через ${daysBetween(f.date, nxt.date)} дн. (${compName(nxt)}) — возможна ротация и экономия сил.`;
  if (f.away === tid) { const d = km(team(f.away), team(f.home)); if (d) s += ` Дорога в гости ≈ ${d} км.`; }
  return s;
}
function cardLine(p: any, date: string) {
  const a = age(p, date), ag = agg().P;
  let seas = '';
  const row = Object.values<any>(ag).filter(x => x.pid === p.id && x.comp === 'rpl')[0];
  if (row) seas = ` В этом сезоне в игре: ${row.m} матчей, ${row.g} гол., ${row.a} пас.`;
  return `${p.pos} ${p.name}${a ? `, ${a} лет` : ''} — стиль: ${p.style || 'нет данных'}. Достижения: ${(p.achievements || []).join('; ') || 'нет данных'}. Статистика 2 сезонов: ${p.stats2y || 'нет данных'}. Форма: ${p.form || 'нет данных'}.${seas} Характер: ${p.character || 'нет данных'}. Новости: ${p.news || 'нет'}.`;
}
async function buildCtx(f: any) {
  const ctx: any = { fid: f.id, comp: compName(f), roundLabel: roundLabel(f), date: f.date, time: f.time, names: {}, pidSide: {}, pidTeam: {}, pos: {}, lineup: {}, sides: {} };
  const H = team(f.home), A = team(f.away);
  ctx.sides = {
    home: { id: H.id, name: H.name, logo: teamLogo(H.id) },
    away: { id: A.id, name: A.name, logo: teamLogo(A.id) }
  };
  ctx.stadium = (H.stadium ? H.stadium + ', ' : '') + (H.city || '');
  for (const s of ['home', 'away']) {
    const tid = f[s], L = getLineup(f, tid); ctx.lineup[s] = L;
    for (const pid of [...L.starters, ...L.bench]) {
      const p = player(pid);
      if (p) {
        ctx.names[pid] = p.name;
        ctx.pidSide[pid] = s;
        ctx.pidTeam[pid] = tid;
        ctx.pos[pid] = p.pos;
      }
    }
  }
  const dv = db.derbies.find((d: any) => (d.a === f.home && d.b === f.away) || (d.a === f.away && d.b === f.home));
  ctx.derby = dv ? `${dv.name}. ${dv.note}` : 'нет';
  ctx.motiv = { home: motivText(f.home, f), away: motivText(f.away, f) };
  const top = Object.values<any>(agg().P).filter(x => x.comp === 'rpl' && x.g > 0).sort((a: any, b: any) => b.g - a.g).slice(0, 5);
  ctx.race = top.length ? top.map((x: any) => `${x.n} (${tn(x.t)}) — ${x.g}`).join('; ') : 'пока нет данных';
  ctx.weather = await weather(H, f.date, f.time);
  ctx.fat = { home: fatText(f.home, f), away: fatText(f.away, f) };
  const miss = (s: string) => squadOf(f[s]).filter((p: any) => !isAvail(p, f.date)).map((p: any) => `${p.name} (${p.banLeft > 0 ? 'дисквалификация' : 'травма'})`);
  ctx.missing = { home: miss('home'), away: miss('away') };

  const cH = getCoachForTeam(f.home), cA = getCoachForTeam(f.away);
  ctx.coaches = {
    home: { coach: cH, synergy: computeCoachSynergy(cH, ctx.lineup.home) },
    away: { coach: cA, synergy: computeCoachSynergy(cA, ctx.lineup.away) }
  };
  return ctx;
}
function lineText(ctx: any, s: string) {
  const L = ctx.lineup[s], f = ctx.date, sd = ctx.sides[s];
  const row = (pid: string) => cardLine(player(pid), f);
  return `СОСТАВ ${sd.name} (схема ${L.formation}), стартовые:\n${L.starters.map((p: string) => '- ' + row(p)).join('\n')}\nСкамейка:\n${L.bench.map((p: string) => '- ' + row(p)).join('\n')}\nНедоступны: ${ctx.missing[s].join(', ') || 'нет'}`;
}
function buildUser(ctx: any, a: number, b: number, st: any, issues: string) {
  const H = ctx.sides.home.name, A = ctx.sides.away.name;
  const sp = (s: string) => (ctx.lineup[s].speech || '').trim() ? `«${ctx.lineup[s].speech.trim()}»` : '(тренер промолчал — пустая речь, тоже сигнал команде)';
  const tr = (s: string) => (ctx.lineup[s].training || '').trim() ? `«${ctx.lineup[s].training.trim()}»` : '(тренировочный план не указан — отдельной подготовки к матчу не было)';
  const cInfo = (s: string) => {
    const c = ctx.coaches[s];
    return `${c.coach.name} (философия: ${c.coach.styleTitle}). Тактическая совместимость: ${c.synergy.statusTitle} (${c.synergy.score}%). ${c.synergy.description}`;
  };
  let u = `ПЕРИОД: минуты ${a}–${b}\n`;
  if (st) u += `СОСТОЯНИЕ МАТЧА НА МОМЕНТ НАЧАЛА ПЕРИОДА: счёт ${st.score[0]}:${st.score[1]}; жёлтые: ${H}: ${st.yellows.home.join(', ') || 'нет'}, ${A}: ${st.yellows.away.join(', ') || 'нет'}; удалены: ${st.reds.join(', ') || 'нет'}; покинули поле (травма/замена): ${st.off.join(', ') || 'нет'}; замены: ${H} ${st.subs.home}/5, ${A} ${st.subs.away}/5. Заменившие вышли на поле: ${st.ins.join(', ') || 'нет'}.${st.note ? ` Заметка о ходе игры: ${st.note}` : ''}\nПоследние события: ${st.last.join(' | ') || '—'}\n`;
  u += `\nМАТЧ: ${H} — ${A} | ${ctx.comp}, ${ctx.roundLabel} | ${ctx.date} ${ctx.time} | Стадион: ${ctx.stadium}\n`;
  u += `\nКОНТЕКСТ ОБЕИХ КОМАНД (учитывай обе стороны):\n- ${ctx.motiv.home}\n- ${ctx.motiv.away}\n- ПРОТИВОСТОЯНИЕ: ${ctx.derby}\n- Гонка бомбардиров РПЛ: ${ctx.race}\n`;
  u += `\nПОГОДА И ПОЛЕ: ${ctx.weather}\n`;
  u += `\nРАСПИСАНИЕ И УСТАЛОСТЬ:\n- ${H}: ${ctx.fat.home}\n- ${A}: ${ctx.fat.away}\n`;
  u += `\nГЛАВНЫЕ ТРЕНЕРЫ И ТАКТИЧЕСКАЯ СИНЕРГИЯ:\n- ${H}: ${cInfo('home')}\n- ${A}: ${cInfo('away')}\n`;
  u += `\nТРЕНИРОВОЧНЫЙ ПЛАН (текст тренера, как есть):\n- ${H}: ${tr('home')}\n- ${A}: ${tr('away')}\n`;
  u += `\nТАКТИКА / РЕЧЬ ТРЕНЕРА ПЕРЕД МАТЧЕМ (как есть):\n- ${H}, схема ${ctx.lineup.home.formation}: ${sp('home')}\n- ${A}, схема ${ctx.lineup.away.formation}: ${sp('away')}\n`;
  u += `\n${lineText(ctx, 'home')}\n\n${lineText(ctx, 'away')}\n`;
  if (issues) u += `\nВНИМАНИЕ: прошлая попытка отклонена из-за проблем: ${issues}. Исправь их.\n`;
  u += `\nСыграй период (минуты ${a}–${b}). Верни только JSON по формату из инструкции.`;
  return u;
}

/* ───────── обработка событий ───────── */
const TYPES = new Set('kickoff possession pass dribble tackle duel foul yellow red shot save miss post goal own_goal penalty offside corner freekick injury sub var ref_error incident highlight halftime fulltime'.split(' '));
function indexNames(ctx: any) {
  return Object.entries<string>(ctx.names).map(([pid, n]) => ({ pid, side: ctx.pidSide[pid], full: norm(n), last: norm(n).split(' ').pop() }));
}
function resolve(idx: any[], name: string, side: string | null) {
  const n = norm(name);
  if (!n) return null;
  const pick = (c: any[]) => {
    if (c.length > 1 && side) c = c.filter((x: any) => x.side === side);
    return c.length === 1 ? c[0].pid : null;
  };
  let r = pick(idx.filter(x => x.full === n));
  if (r) return r;
  r = pick(idx.filter(x => x.full.includes(n) || n.includes(x.full)));
  if (r) return r;
  const last = n.split(' ').pop();
  return pick(idx.filter(x => x.last === last));
}
function deriveState(events: any[], ctx: any, note?: string) {
  const st: any = { score: [0, 0], yellows: { home: [], away: [] }, reds: [], off: [], subs: { home: 0, away: 0 }, ins: [], note: note || '', last: events.slice(-8).map(e => `${e.min}' ${e.text}`) };
  for (const e of events) {
    if (e.type === 'goal') st.score[e.team === 'home' ? 0 : 1]++;
    if (e.type === 'own_goal') st.score[e.team === 'home' ? 0 : 1]++;
    const nm = (i: number) => ctx.names[e.pids?.[i]];
    if (e.type === 'yellow' && nm(0)) st.yellows[e.team]?.push(nm(0));
    if (e.type === 'red' && nm(0)) { st.reds.push(nm(0)); st.off.push(nm(0)); }
    if (e.type === 'sub') { st.subs[e.team]++; if (nm(1)) st.off.push(nm(1)); if (nm(0)) st.ins.push(nm(0)); }
    if (e.type === 'injury' && nm(0)) st.off.push(nm(0));
  }
  return st;
}
function normalizeEvents(raw: any[], a: number, b: number, ctx: any, prev: any[]) {
  if (!Array.isArray(raw) || raw.length < 3) throw new Error('слишком мало событий');
  const idx = indexNames(ctx), probs: string[] = [], unknown = new Set<string>();
  const st = deriveState(prev, ctx); const off = new Set(st.off.map(norm)); const subs = { ...st.subs };
  let out: any[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const type = String(e.type || '').toLowerCase().trim();
    if (!TYPES.has(type)) { probs.push('неизвестный тип ' + type); continue; }
    let min = Math.round(+e.min), sec = clamp(Math.round(+e.sec) || 0, 0, 59);
    if (!(min >= 0)) { probs.push('нет минуты'); continue; }
    if (min < a - 1 || min > b + 10) { probs.push(`минута ${min} вне периода ${a}–${b}`); continue; }
    const pids: string[] = [], names: string[] = [];
    for (const n of (Array.isArray(e.players) ? e.players : [])) {
      const pid = resolve(idx, n, ['home', 'away'].includes(e.team) && !['save', 'sub', 'foul', 'tackle'].includes(type) ? e.team : null);
      if (pid) { pids.push(pid); names.push(ctx.names[pid]); }
      else if (n) unknown.add(n);
    }
    let team = ['home', 'away', 'none'].includes(e.team) ? e.team : null;
    if (!team) team = pids[0] ? ctx.pidSide[pids[0]] : 'none';
    if (type === 'own_goal' && !['home', 'away'].includes(team)) { probs.push('автогол без команды'); continue; }
    const actor = (type === 'sub' || type === 'save') ? null : pids[0];
    if (actor && off.has(norm(ctx.names[actor])) && !['yellow', 'red', 'injury', 'foul'].includes(type) && !['var', 'incident', 'highlight'].includes(type)) {
      probs.push(`${ctx.names[actor]} действует после ухода с поля`);
    }
    if (type === 'red' && pids[0]) off.add(norm(ctx.names[pids[0]]));
    if (type === 'injury' && pids[0]) off.add(norm(ctx.names[pids[0]]));
    if (type === 'sub') {
      if (['home', 'away'].includes(team)) { if (++subs[team] > 5) probs.push('больше 5 замен'); }
      if (pids[1]) off.add(norm(ctx.names[pids[1]]));
    }
    const ev: any = { min, sec, team, type, players: names, pids, text: String(e.text || '').slice(0, 500) };
    if (type === 'shot' || type === 'penalty') ev.xg = clamp(+e.xg || (type === 'penalty' ? 0.76 : 0.08), 0.01, 0.95);
    if (type === 'injury') ev.out_days = clamp(Math.round(+e.out_days) || 14, 1, 240);
    out.push(ev);
  }
  {
    const g = out.filter(x => x.type === 'goal' || x.type === 'own_goal');
    const tot = st.score[0] + st.score[1] + g.length;
    if (tot > 10) probs.push('нереалистично много голов (' + tot + '), матч должен выглядеть как настоящий футбол');
  }
  if (unknown.size > 4) probs.push('неизвестные игроки (используй только игроков из составов): ' + [...unknown].slice(0, 6).join(', '));
  if (probs.length > 3) throw new Error([...new Set(probs)].slice(0, 6).join('; '));
  out = out.map((e, i) => ({ e, i })).sort((x, y) => (x.e.min * 60 + x.e.sec) - (y.e.min * 60 + y.e.sec) || x.i - y.i).map(x => x.e);
  if (!out.length) throw new Error('нет валидных событий');
  const lastMin = out[out.length - 1].min;
  if (b === 45 && !out.some(e => e.type === 'halftime')) out.push({ min: Math.max(45, lastMin), sec: 59, team: 'none', type: 'halftime', players: [], pids: [], text: 'Свисток — перерыв.' });
  if (b >= 90 && !out.some(e => e.type === 'fulltime')) out.push({ min: Math.max(90, lastMin), sec: 59, team: 'none', type: 'fulltime', players: [], pids: [], text: 'Финальный свисток!' });
  return out;
}
function rescore(events: any[]) {
  let h = 0, a = 0;
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'own_goal') {
      if (e.team === 'home') h++; else if (e.team === 'away') a++;
    }
    e.score = [h, a];
  }
  return [h, a];
}

/* запасной генератор, если нейросеть недоступна */
function fakePeriod(a: number, b: number, ctx: any, prev: any[]) {
  const ev: any[] = [], R = rng(ctx.fid + a), pick = (arr: any[]) => arr[Math.floor(R() * arr.length)];
  const st = deriveState(prev, ctx); const off = new Set(st.off);
  const onP = (s: string) => Object.keys(ctx.names).filter(p => ctx.pidSide[p] === s && ctx.lineup[s].starters.includes(p) && !off.has(ctx.names[p]));
  const push = (min: number, sec: number, team: string, type: string, pl: string[], text: string, x?: any) => {
    const o = { min, sec, team, type, players: pl.map(p => ctx.names[p]), pids: pl, text, ...x };
    ev.push(o);
  };
  if (a === 1 || a === 46) push(a, 0, 'none', 'kickoff', [], a === 1 ? 'Начали! Мяч в игре.' : 'Начался второй тайм.');
  let hold = R() < .5 ? 'home' : 'away';
  for (let m = a; m <= b; m++) {
    if (R() < .3) hold = hold === 'home' ? 'away' : 'home';
    const s = hold, o = s === 'home' ? 'away' : 'home', P = onP(s), Q = onP(o);
    if (!P.length || !Q.length) continue;
    const p1 = pick(P), p2 = pick(P);
    push(m, 5, s, 'pass', [p1, p2], `${ctx.names[p1]} отдаёт мяч ${ctx.names[p2]}, ${ctx.sides[s].name} держит игру.`);
    const r = R();
    const synS = ctx.coaches?.[s]?.synergy;
    const shotThreshold = 0.13 * (synS?.xgMultiplier || 1.0);
    if (r < shotThreshold) {
      const sh = pick(P.filter(p => GROUP[ctx.pos[p]] !== 'gk')) || P[0];
      const gk = Q.find(p => ctx.pos[p] === 'ВР') || Q[0];
      const x = +(0.04 + R() * .25 * (synS?.xgMultiplier || 1.0)).toFixed(2);
      push(m, 20, s, 'shot', [sh], `${ctx.names[sh]} бьёт по воротам!`, { xg: x });
      const q = R();
      const goalThreshold = 0.22 * (synS?.xgMultiplier || 1.0);
      if (q < goalThreshold) {
        push(m, 23, s, 'goal', [sh, p2 !== sh ? p2 : p1], `ГОЛ! ${ctx.names[sh]} переигрывает вратаря!`);
      } else if (q < .6) {
        push(m, 23, o, 'save', [gk, sh], `${ctx.names[gk]} вытаскивает мяч!`);
      } else {
        push(m, 23, s, 'miss', [sh], 'Мимо ворот.');
      }
    } else if (r < .24) {
      const f = pick(Q), v = pick(P);
      push(m, 40, o, 'foul', [f, v], `${ctx.names[f]} нарушает правила против ${ctx.names[v]}.`);
      if (R() < .15) push(m, 45, o, 'yellow', [f], `Жёлтая карточка ${ctx.names[f]}.`);
    } else if (r < .31) {
      push(m, 35, s, 'corner', [], `Угловой в пользу ${ctx.sides[s].name}.`);
    } else if (r < .4) {
      const t = pick(Q), l = pick(P);
      push(m, 50, o, 'tackle', [t, l], `${ctx.names[t]} отбирает мяч у ${ctx.names[l]}.`);
      hold = o;
    }
  }
  if (b === 45) push(45, 59, 'none', 'halftime', [], 'Перерыв.');
  if (b >= 90) push(90, 59, 'none', 'fulltime', [], 'Матч окончен.');
  return ev;
}
async function genPeriod(a: number, b: number, ctx: any, prev: any[], note?: string, depth = 0): Promise<any> {
  const sys = db.settings.systemPrompt || SYS_DEFAULT;
  if (!hasLLM()) return { events: fakePeriod(a, b, ctx, prev), note };
  let issues = '', lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const st = prev.length ? deriveState(prev, ctx, note) : null;
      const user = buildUser(ctx, a, b, st, issues);
      if (!ctx.prompt1) ctx.prompt1 = user;
      const r = await llmJSON(sys, user, { task: 'match', temp: 0.9, max: 20000 });
      const evs = normalizeEvents(r.events, a, b, ctx, prev);
      return { events: evs, note: r.state_at_end?.momentum_note || note };
    } catch (e: any) {
      lastErr = e.message;
      issues = e.message;
      if (e.noLLM) break;
    }
  }
  if (b - a >= 14) {
    const mid = Math.floor((a + b) / 2);
    const x = await genPeriod(a, mid, ctx, prev, note, depth + 1);
    const y = await genPeriod(mid + 1, b, ctx, prev.concat(x.events), x.note, depth + 1);
    return { events: x.events.concat(y.events), note: y.note };
  }
  console.error(`период ${a}-${b}: запасной вариант (${lastErr})`);
  return { events: fakePeriod(a, b, ctx, prev), note, fallback: true };
}

/* ───────── статистика матча ───────── */
function computeStats(events: any[], ctx: any) {
  const mk = () => ({ g: 0, sh: 0, sot: 0, xg: 0, fo: 0, co: 0, yc: 0, rc: 0, tk: 0, sv: 0, off: 0, penF: 0, penA: 0, refF: 0, refA: 0, sub: 0 });
  const t: any = { home: mk(), away: mk() }, P: Record<string, any> = {}, posT: any = { home: 0, away: 0 };
  const pl = (pid: string) => {
    if (!pid) return {};
    return P[pid] ||= { n: ctx.names[pid], t: ctx.pidTeam[pid], side: ctx.pidSide[pid], min: 0, g: 0, a: 0, yc: 0, rc: 0, tk: 0, sv: 0, sh: 0, xg: 0, ff: 0, fa: 0, cs: 0 };
  };
  const start: Record<string, number> = {}, end: Record<string, number> = {};
  for (const s of ['home', 'away']) {
    for (const pid of ctx.lineup[s].starters) start[pid] = 0;
  }
  const lastMin = events.length ? Math.max(90, events[events.length - 1].min) : 90;
  const playT = new Set(['possession', 'pass', 'dribble', 'tackle', 'shot', 'corner', 'freekick', 'save', 'miss', 'post', 'goal', 'penalty', 'offside']);
  let open: any = null;
  events.forEach((e, i) => {
    const s = e.team, o = s === 'home' ? 'away' : 'home', ok = s === 'home' || s === 'away', T = ok ? t[s] : null, To = ok ? t[o] : null;
    if (ok && playT.has(e.type) && events[i + 1]) T && (posT[s] += clamp((events[i + 1].min * 60 + events[i + 1].sec) - (e.min * 60 + e.sec), 0, 75));
    const p0 = e.pids[0], p1 = e.pids[1];
    switch (e.type) {
      case 'shot': if (ok) { T.sh++; T.xg += e.xg || 0.08; open = { s, pid: p0 }; const x = pl(p0); if (x.sh !== undefined) { x.sh++; x.xg += e.xg || 0.08; } } break;
      case 'penalty': if (ok) { T.penF++; To.penA++; } break;
      case 'goal': if (ok) { T.g++; T.sot++; if (!open) { T.sh++; T.xg += 0.3; } pl(p0).g++; if (p1) pl(p1).a++; if (!open && p0) { pl(p0).sh++; } } open = null; break;
      case 'own_goal': if (ok) T.g++; break;
      case 'save': if (ok) { T.sv++; if (!open) { To.sh++; To.xg += 0.1; } To.sot++; pl(p0).sv++; if (!open && p1) pl(p1).sh++; } open = null; break;
      case 'miss': case 'post': if (ok && !open) { T.sh++; T.xg += 0.05; if (p0) pl(p0).sh++; } open = null; break;
      case 'foul': if (ok) { T.fo++; if (p0) pl(p0).ff++; if (p1) pl(p1).fa++; } break;
      case 'yellow': if (ok) { T.yc++; if (p0) pl(p0).yc++; } break;
      case 'red': if (ok) { T.rc++; if (p0) { pl(p0).rc++; end[p0] = e.min; } } break;
      case 'corner': if (ok) T.co++; break;
      case 'offside': if (ok) T.off++; break;
      case 'tackle': if (ok) { T.tk++; if (p0) pl(p0).tk++; } break;
      case 'ref_error': if (ok) { T.refF++; To.refA++; } break;
      case 'sub': if (ok) { T.sub++; if (p1) end[p1] = e.min; if (p0) start[p0] = e.min; } break;
    }
  });
  for (const pid of Object.keys(start)) {
    const x = pl(pid);
    x.min = Math.max(0, (end[pid] ?? lastMin) - start[pid]);
  }
  for (const side of ['home', 'away']) {
    const conc = t[side === 'home' ? 'away' : 'home'].g;
    if (conc === 0) {
      for (const pid of Object.keys(start)) {
        if (ctx.pidSide[pid] === side && ctx.pos[pid] === 'ВР' && end[pid] === undefined) pl(pid).cs = 1;
      }
    }
  }
  for (const side of ['home', 'away']) t[side].xg = +t[side].xg.toFixed(2);
  for (const x of Object.values<any>(P)) x.xg = +x.xg.toFixed(2);
  const tot = posT.home + posT.away || 1;
  const poss = [Math.round(posT.home / tot * 100)];
  poss.push(100 - poss[0]);
  return { teams: t, players: P, poss };
}

/* ───────── запуск матчей и трансляция ───────── */
const live: Record<string, { clients: Set<any> }> = {};
const timers: Record<string, any> = {};
const fullSim = (f: any) => squadOf(f.home).length >= 14 && squadOf(f.away).length >= 14;
const queue: string[] = [];
let running = 0;
function enqueue(id: string) {
  const f = fx(id);
  if (!f || f.status !== 'scheduled') return;
  f.status = 'queued';
  save();
  queue.push(id);
  pumpQ();
}
function pumpQ() {
  while (running < 2 && queue.length) {
    running++;
    runMatch(queue.shift()!).catch(e => console.error('runMatch', e)).finally(() => { running--; pumpQ(); });
  }
}
async function runMatch(id: string) {
  const f = fx(id);
  f.status = 'generating';
  f.err = '';
  save();
  try {
    const ctx = await buildCtx(f);
    const periods = db.settings.chunks == 6 ? [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75], [76, 90]] : [[1, 45], [46, 90]];
    let events: any[] = [], note = '', fallback = false;
    for (const [a, b] of periods) {
      const r = await genPeriod(a, b, ctx, events, note);
      events = events.concat(r.events);
      note = r.note;
      fallback = fallback || r.fallback;
    }
    events.forEach((e, i) => e.i = i);
    const [h, a] = rescore(events);
    putMatch(id, { events, ctx, fallback });
    f.final = [h, a];
    f.hg = 0;
    f.ag = 0;
    f.pos = 0;
    f.status = 'live';
    f.fallback = !!fallback;
    save();
    startLive(id);
  } catch (e: any) {
    console.error('матч не удался:', e);
    f.status = 'scheduled';
    f.err = e.message;
    save();
  }
}
function startLive(id: string) {
  const f = fx(id), m = getMatch(id);
  live[id] ||= { clients: new Set() };
  if (f.pos === 0) {
    tg(`🏟 <b>${esc(tn(f.home))} — ${esc(tn(f.away))}</b>\n${esc(compName(f))}, ${esc(roundLabel(f))}\nТрансляция началась${db.settings.siteUrl ? `: ${esc(db.settings.siteUrl)}/#/match/${id}` : ''}`);
  }
  const step = () => {
    if (f.pos >= m.events.length) return finish(id);
    const e = m.events[f.pos++];
    f.hg = e.score[0]; f.ag = e.score[1];
    pushLive(id, { type: 'event', e });
    tgEvent(f, e);
    save();
    const nx = m.events[f.pos];
    let d = 1500;
    if (nx) {
      const dm = ((nx.min * 60 + nx.sec) - (e.min * 60 + e.sec)) / 60;
      d = clamp(dm * db.settings.secPerMin * 1000, Math.min(900, db.settings.secPerMin * 1000), 20000);
      if (e.type === 'halftime') d = Math.max(d, db.settings.breakSec * 1000);
    }
    timers[id] = setTimeout(step, d);
  };
  step();
}
function pushLive(id: string, obj: any) {
  const l = live[id];
  if (!l) return;
  const s = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const r of l.clients) r.write(s);
}
function finish(id: string) {
  const f = fx(id), m = getMatch(id);
  f.hg = f.final[0]; f.ag = f.final[1];
  f.st = computeStats(m.events, m.ctx);
  m.stats = f.st;
  const HName = tn(f.home), AName = tn(f.away);
  const cH = getCoachForTeam(f.home), cA = getCoachForTeam(f.away);
  m.ratings = computeMatchRatings(m, f, HName, AName);
  m.motm = getMatchMotm(m, f, HName, AName, cH, cA);
  if (m.motm) f.motm = { pid: m.motm.pid, name: m.motm.name, rating: m.motm.rating };
  putMatch(id, m);
  if (f.comp === 'cup' && f.hg === f.ag && !f.pen) f.pen = shootout(f);
  f.status = 'done';
  if (f.comp === 'cup') advanceCup();
  for (const s of ['home', 'away']) {
    for (const pid of Object.keys(m.ctx.names)) {
      if (m.ctx.pidSide[pid] !== s) continue;
      const p = player(pid);
      if (p && p.banLeft > 0 && !m.ctx.lineup[s].starters.includes(pid) && !m.ctx.lineup[s].bench.includes(pid)) p.banLeft--;
    }
    for (const p of squadOf(f[s])) {
      if (p.banLeft > 0 && !(f.st.players[p.id])) p.banLeft--;
    }
  }
  for (const e of m.events) {
    const p = player(e.pids?.[0]);
    if (!p) continue;
    if (e.type === 'injury') p.out = { until: addDays(f.date, e.out_days || 14), reason: e.text.slice(0, 120) };
    if (e.type === 'red') p.banLeft = 1;
    if (e.type === 'yellow') {
      p.seasonYC = (p.seasonYC || 0) + 1;
      if (p.seasonYC % 4 === 0) p.banLeft = Math.max(p.banLeft || 0, 1);
    }
  }
  invalidateAgg();
  advanceCup();
  save();
  const st = f.st;
  tg(`🏁 <b>Итог: ${esc(tn(f.home))} ${f.hg}:${f.ag} ${esc(tn(f.away))}</b>${f.pen ? ` (пен. ${f.pen.hg}:${f.pen.ag})` : ''}\nВладение ${st.poss[0]}–${st.poss[1]}, удары ${st.teams.home.sh}–${st.teams.away.sh}, xG ${st.teams.home.xg}–${st.teams.away.xg}${db.settings.siteUrl ? `\n${esc(db.settings.siteUrl)}/#/match/${id}` : ''}`);
  pushLive(id, { type: 'end' });
  delete timers[id];
}
function shootout(f: any) {
  const r = rng(f.id + 'pen');
  let h = 3 + Math.floor(r() * 3), a = 3 + Math.floor(r() * 3);
  if (h === a) { r() < .5 ? h++ : a++; }
  return { hg: h, ag: a, winner: h > a ? 'home' : 'away' };
}
function resumeLive() {
  for (const f of db.fixtures) {
    if (f.status === 'live' && getMatch(f.id)) startLive(f.id);
    else if (['live', 'generating', 'queued'].includes(f.status)) { f.status = 'scheduled'; }
  }
  save();
}

/* Telegram */
const tgQ: string[] = [];
let tgBusy = false;
function tg(text: string) {
  if (!db.settings.tgToken || !db.settings.tgChat) return;
  tgQ.push(text);
  tgPump();
}
async function tgPump() {
  if (tgBusy) return;
  tgBusy = true;
  while (tgQ.length) {
    const t = tgQ.shift()!;
    try {
      const r = await fetch(`https://api.telegram.org/bot${db.settings.tgToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: db.settings.tgChat, text: t, parse_mode: 'HTML', disable_web_page_preview: true })
      });
      if (r.status === 429) {
        const j: any = await r.json().catch(() => ({}));
        tgQ.unshift(t);
        await sleep((j.parameters?.retry_after || 5) * 1000);
      }
    } catch { }
    await sleep(1100);
  }
  tgBusy = false;
}
const TGI: Record<string, string> = { goal: '⚽', own_goal: '⚽', yellow: '🟨', red: '🟥', injury: '🚑', penalty: '🎯', var: '📺', ref_error: '🧑‍⚖️', halftime: '⏸', fulltime: '🏁', highlight: '🔥', incident: '❗', save: '🧤', post: '🥅', sub: '🔁', kickoff: '▶️' };
function tgEvent(f: any, e: any) {
  if (!['goal', 'own_goal', 'yellow', 'red', 'injury', 'penalty', 'var', 'ref_error', 'highlight', 'incident', 'halftime', 'kickoff', 'sub', 'post'].includes(e.type) && !(e.type === 'save' && (e.xg || 0) > 0)) return;
  if (e.type === 'sub' || (e.type === 'kickoff' && e.min > 1)) return;
  const sc = (e.type === 'goal' || e.type === 'own_goal') ? `\n<b>${esc(tn(f.home))} ${e.score[0]}:${e.score[1]} ${esc(tn(f.away))}</b>` : '';
  tg(`${TGI[e.type] || '•'} <b>${e.min}'</b> ${esc(e.text)}${sc}`);
}

/* фоновые матчи */
const BG_SYS = `Ты — сводка результатов российского футбола в симуляторе. По списку матчей верни реалистичные счета. Учитывай уровень лиги, класс команд, домашнее поле и положение в таблице, если оно дано. Счета разные и естественные для футбола: чаще 1:0, 1:1, 2:1, 2:0, 0:0, иногда крупнее. В кубке ничьих не бывает: при равном счёте укажи победителя по пенальти в поле "winner" ("home" или "away").
Верни только JSON: {"results":[{"id":"...","hg":1,"ag":0,"winner":"home|away (только кубок при ничьей)","note":"необязательно, 5-10 слов"}]}`;
function poisson(l: number, r: () => number) {
  let L = Math.exp(-l), k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
async function bgResults(list: any[]) {
  if (!list.length) return;
  let res: any = null;
  if (hasLLM()) {
    try {
      const rows: Record<string, any> = {};
      const pos = (tid: string) => {
        const t = team(tid);
        if (!rows[t.comp]) rows[t.comp] = table(t.comp);
        const r = rows[t.comp].find((x: any) => x.id === tid);
        return r && r.p ? ` (${r.pos}-е, ${r.pts} очк.)` : '';
      };
      const text = list.map(f => `${f.id} | ${compName(f)}${f.comp === 'cup' ? ' (кубок)' : ''} | ${tn(f.home)}${pos(f.home)} — ${tn(f.away)}${pos(f.away)}`).join('\n');
      const r = await llmJSON(BG_SYS, text, { task: 'bg', temp: 1, max: 12000 });
      res = r.results || r;
    } catch (e: any) {
      console.error('bg:', e.message);
    }
  }
  for (const f of list) {
    let x = Array.isArray(res) ? res.find(z => z && z.id === f.id) : null;
    if (!x || !Number.isInteger(+x.hg) || !Number.isInteger(+x.ag) || +x.hg > 9 || +x.ag > 9) {
      const r = rng(f.id + Date.now());
      x = { hg: poisson(1.45, r), ag: poisson(1.1, r) };
    }
    f.hg = +x.hg; f.ag = +x.ag; f.note = x.note || '';
    if (f.comp === 'cup' && f.hg === f.ag) {
      const w = x.winner === 'home' || x.winner === 'away' ? x.winner : (rng(f.id)() < .5 ? 'home' : 'away');
      f.pen = { hg: w === 'home' ? 5 : 4, ag: w === 'home' ? 4 : 5, winner: w };
    }
    f.status = 'done';
    f.st = null;
    const hSq = squadOf(f.home), aSq = squadOf(f.away);
    const winSq = f.hg >= f.ag ? hSq : aSq;
    const pMotm = winSq[0] || hSq[0];
    if (pMotm) {
      f.motm = { pid: pMotm.id, name: pMotm.name, rating: +(7.5 + (f.hg > f.ag ? 0.8 : 0.3)).toFixed(1) };
    }
  }
  invalidateAgg();
}
async function runBatch(list: any[]) {
  list = list.filter(f => f.status === 'scheduled');
  const full = list.filter(fullSim), bg = list.filter(f => !fullSim(f));
  bg.forEach(f => f.status = 'queued');
  await bgResults(bg);
  advanceCup();
  save();
  full.forEach(f => enqueue(f.id));
  return { full: full.length, bg: bg.length };
}

/* ───────── генерация сезона и кубок ───────── */
function genSeason(start: string, name: string) {
  db.settings.season = name;
  const season = name;
  const rd: string[] = [];
  let d = start;
  const gaps = [7, 7, 7, 3, 4];
  for (let i = 0; i < 70; i++) { rd.push(d); d = addDays(d, gaps[i % 5]); }
  const SLOTS = [[-1, '19:00'], [0, '13:30'], [0, '16:00'], [0, '18:30'], [1, '13:30'], [1, '16:00'], [1, '18:30'], [1, '20:45']];
  const r = rng('season' + name);
  for (const comp of COMPS.filter(x => x.type === 'league')) {
    const c = comp.id;
    let ids: (string | null)[] = db.teams.filter((t: any) => t.comp === c).map((t: any) => t.id);
    if (ids.length < 2) continue;
    if (ids.length % 2) ids.push(null);
    const n = ids.length, arr = [...ids], rounds: any[] = [];
    for (let k = 0; k < n - 1; k++) {
      const pairs: any[] = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a && b) pairs.push(k % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop()!);
    }
    const all = rounds.concat(rounds.map(p => p.map(([a, b]: any) => [b, a])));
    all.forEach((pairs, ri) => {
      const date = rd[ri];
      const mid = new Date(date + 'T12:00:00Z').getUTCDay() !== 6;
      let order = shuffle(pairs, r);
      const dIdx = order.findIndex(([a, b]: any) => db.derbies.some((x: any) => (x.a === a && x.b === b) || (x.a === b && x.b === a)));
      if (dIdx >= 0 && c === 'rpl') {
        const [dm] = order.splice(dIdx, 1);
        order.splice(Math.min(3, order.length), 0, dm);
      }
      order.forEach(([a, b]: any, mi) => {
        let dd = date, tm: string;
        if (c === 'rpl') {
          if (mid) {
            dd = date;
            tm = mi % 2 ? '19:30' : '17:00';
          } else {
            const [off, t] = SLOTS[mi % SLOTS.length];
            dd = addDays(date, off as number);
            tm = t as string;
          }
        } else {
          dd = addDays(date, mi % 2);
          tm = ['12:00', '14:00', '15:00', '16:30'][mi % 4];
        }
        db.fixtures.push({ id: uid(), season, comp: c, round: ri + 1, date: dd, time: tm, home: a, away: b, status: 'scheduled', hg: null, ag: null, pos: 0 });
      });
    });
  }
  // Формируем Кубок России 2026/2027: Путь РПЛ (4 группы) и Путь регионов (отборочные раунды)
  const rplTeams = db.teams.filter((t: any) => t.comp === 'rpl');
  const fnlTeams = db.teams.filter((t: any) => t.comp === 'fnl');
  const secondLeagueTeams = db.teams.filter((t: any) => t.comp.startsWith('2la') || t.comp.startsWith('2lb'));
  const mediaTeams = db.teams.filter((t: any) => t.comp === 'media');

  const { cupState, fixtures: cupFixtures } = initCup2026(season, rplTeams, fnlTeams, secondLeagueTeams, mediaTeams, uid);
  db.cupState2026 = cupState;
  db.fixtures.push(...cupFixtures);

  db.players.forEach((p: any) => { p.seasonYC = 0; p.banLeft = 0; });
  invalidateAgg();
  save();
}

function advanceCup() {
  if (!db.cupState2026) {
    const rplTeams = db.teams.filter((t: any) => t.comp === 'rpl');
    const fnlTeams = db.teams.filter((t: any) => t.comp === 'fnl');
    const secondLeagueTeams = db.teams.filter((t: any) => t.comp.startsWith('2la') || t.comp.startsWith('2lb'));
    const mediaTeams = db.teams.filter((t: any) => t.comp === 'media');
    const { cupState, fixtures: cupFixtures } = initCup2026(S(), rplTeams, fnlTeams, secondLeagueTeams, mediaTeams, uid);
    db.cupState2026 = cupState;
    db.fixtures = db.fixtures.filter((f: any) => f.comp !== 'cup').concat(cupFixtures);
    save();
  }

  // Пересчет турнирных таблиц групп Пути РПЛ
  recalculateCupGroups(db.cupState2026, seasonFx());

  // Проверка: завершен ли групповой этап Пути РПЛ (48 матчей)
  const rplGroupFx = seasonFx().filter((f: any) => f.comp === 'cup' && f.cupPath === 'rpl_group');
  const allGroupsDone = rplGroupFx.length >= 48 && rplGroupFx.every((f: any) => f.status === 'done');
  const existingR16 = seasonFx().filter((f: any) => f.comp === 'cup' && f.cupStage === 'rpl_playoff_r16');

  if (allGroupsDone && !existingR16.length) {
    db.cupState2026.stage = 'playoff_spring';
    const tA = db.cupState2026.rplGroups['A'].table;
    const tB = db.cupState2026.rplGroups['B'].table;
    const tC = db.cupState2026.rplGroups['C'].table;
    const tD = db.cupState2026.rplGroups['D'].table;

    // Пары 1/8 финала Пути РПЛ (двухматчевые):
    // 1-й матч дома проводит команда, занявшая 2-е место в группе!
    const ties = [
      { a: tA[0].id, b: tB[1].id, name: '1/8 финала Пути РПЛ · Пара 1' },
      { a: tB[0].id, b: tA[1].id, name: '1/8 финала Пути РПЛ · Пара 2' },
      { a: tC[0].id, b: tD[1].id, name: '1/8 финала Пути РПЛ · Пара 3' },
      { a: tD[0].id, b: tC[1].id, name: '1/8 финала Пути РПЛ · Пара 4' }
    ];

    ties.forEach((tie, idx) => {
      // 1-й матч (дома 2-е место - tie.b)
      db.fixtures.push({
        id: uid(),
        season: S(),
        comp: 'cup',
        cupPath: 'rpl_playoff',
        cupStage: 'rpl_playoff_r16',
        tieId: `r16_${idx + 1}`,
        leg: 1,
        round: 201,
        label: `${tie.name} (1-й матч)`,
        date: '2027-03-03',
        time: idx % 2 === 0 ? '18:00' : '20:30',
        home: tie.b,
        away: tie.a,
        status: 'scheduled',
        hg: null,
        ag: null,
        pos: 0
      });

      // 2-й матч (дома 1-е место - tie.a)
      db.fixtures.push({
        id: uid(),
        season: S(),
        comp: 'cup',
        cupPath: 'rpl_playoff',
        cupStage: 'rpl_playoff_r16',
        tieId: `r16_${idx + 1}`,
        leg: 2,
        round: 202,
        label: `${tie.name} (Ответный матч)`,
        date: '2027-03-17',
        time: idx % 2 === 0 ? '18:00' : '20:30',
        home: tie.a,
        away: tie.b,
        status: 'scheduled',
        hg: null,
        ag: null,
        pos: 0
      });
    });

    // 1/8 финала Пути регионов: 3-и места групп РПЛ против победителей отбора регионов
    // В паре с командой не из РПЛ хозяин — клуб не из РПЛ!
    const thirdPlaces = [tA[2].id, tB[2].id, tC[2].id, tD[2].id];
    const r4Fx = seasonFx().filter((f: any) => f.comp === 'cup' && f.qualRound === 4 && f.status === 'done');
    const r4Winners = r4Fx.map(winnerOf);
    const regOpponents = r4Winners.length >= 4 ? r4Winners.slice(0, 4) : [...db.teams.filter((t: any) => t.comp === 'fnl' || t.comp === 'media')].slice(0, 4).map((t: any) => t.id);

    thirdPlaces.forEach((rplTid, idx) => {
      const regTid = regOpponents[idx % regOpponents.length];
      db.fixtures.push({
        id: uid(),
        season: S(),
        comp: 'cup',
        cupPath: 'regions_playoff',
        cupStage: 'regions_r16',
        round: 301,
        label: 'Путь регионов · 1/8 финала (на вылет)',
        date: '2027-03-10',
        time: idx % 2 === 0 ? '17:00' : '19:30',
        home: regTid, // Хозяин — клуб не из РПЛ!
        away: rplTid,
        status: 'scheduled',
        hg: null,
        ag: null,
        pos: 0
      });
    });
    save();
  }
}

function performSeasonRotation() {
  const currentSeason = S();
  const [y1, y2] = currentSeason.split('/');
  const nextSeason = `${+y1 + 1}/${(+y2 + 1) % 100}`;

  const rplRows = table('rpl');
  const fnlRows = table('fnl');
  const goldRows = table('2la_gold');
  const silverRows = table('2la_silver');
  const b1Rows = table('2lb_1');
  const b2Rows = table('2lb_2');
  const b3Rows = table('2lb_3');
  const b4Rows = table('2lb_4');

  const report: {
    promotions: { team: string; from: string; to: string; reason: string }[];
    relegations: { team: string; from: string; to: string; reason: string }[];
    playoffs: { match: string; score: string; winner: string }[];
  } = {
    promotions: [],
    relegations: [],
    playoffs: []
  };

  const rplRelegatedIds: string[] = [];
  const fnlPromotedIds: string[] = [];

  // Прямой вылет: 15-е и 16-е места РПЛ
  if (rplRows.length >= 16) {
    const rpl15 = rplRows[14], rpl16 = rplRows[15];
    rplRelegatedIds.push(rpl15.id, rpl16.id);
    report.relegations.push(
      { team: rpl15.name, from: 'РПЛ', to: 'Первая лига', reason: '15-е место в РПЛ (прямой вылет)' },
      { team: rpl16.name, from: 'РПЛ', to: 'Первая лига', reason: '16-е место в РПЛ (прямой вылет)' }
    );
  }

  // Прямой выход: 1-е и 2-е места Первой лиги
  if (fnlRows.length >= 2) {
    const fnl1 = fnlRows[0], fnl2 = fnlRows[1];
    fnlPromotedIds.push(fnl1.id, fnl2.id);
    report.promotions.push(
      { team: fnl1.name, from: 'Первая лига', to: 'РПЛ', reason: '1-е место в Первой лиге (прямой выход)' },
      { team: fnl2.name, from: 'Первая лига', to: 'РПЛ', reason: '2-е место в Первой лиге (прямой выход)' }
    );
  }

  // Переходные стыковые матчи РПЛ / Первой лиги
  if (rplRows.length >= 14 && fnlRows.length >= 4) {
    const rpl13 = rplRows[12], fnl4 = fnlRows[3];
    const rpl14 = rplRows[13], fnl3 = fnlRows[2];

    const win13 = (rpl13.pts || 0) >= (fnl4.pts || 0) ? rpl13 : fnl4;
    report.playoffs.push({
      match: `Стык: ${rpl13.name} (13-е РПЛ) — ${fnl4.name} (4-е ФНЛ)`,
      score: win13.id === rpl13.id ? '2:1 (по сумме 2 матчей)' : '1:2 (по сумме 2 матчей)',
      winner: win13.name
    });
    if (win13.id === fnl4.id) {
      fnlPromotedIds.push(fnl4.id);
      rplRelegatedIds.push(rpl13.id);
      report.promotions.push({ team: fnl4.name, from: 'Первая лига', to: 'РПЛ', reason: 'Победа в стыках' });
      report.relegations.push({ team: rpl13.name, from: 'РПЛ', to: 'Первая лига', reason: 'Поражение в стыках' });
    }

    const win14 = (rpl14.pts || 0) >= (fnl3.pts || 0) ? rpl14 : fnl3;
    report.playoffs.push({
      match: `Стык: ${rpl14.name} (14-е РПЛ) — ${fnl3.name} (3-е ФНЛ)`,
      score: win14.id === rpl14.id ? '3:2 (по сумме 2 матчей)' : '0:2 (по сумме 2 матчей)',
      winner: win14.name
    });
    if (win14.id === fnl3.id) {
      fnlPromotedIds.push(fnl3.id);
      rplRelegatedIds.push(rpl14.id);
      report.promotions.push({ team: fnl3.name, from: 'Первая лига', to: 'РПЛ', reason: 'Победа в стыках' });
      report.relegations.push({ team: rpl14.name, from: 'РПЛ', to: 'Первая лига', reason: 'Поражение в стыках' });
    }
  }

  // Ротация: Первая лига ⇄ 2-я лига «А» «Золото»
  const fnlRelegatedIds: string[] = [];
  const goldPromotedIds: string[] = [];
  if (fnlRows.length >= 18) {
    const fnl17 = fnlRows[16], fnl18 = fnlRows[17];
    fnlRelegatedIds.push(fnl17.id, fnl18.id);
    report.relegations.push(
      { team: fnl17.name, from: 'Первая лига', to: '2-я лига «А» Золото', reason: '17-е место (вылет)' },
      { team: fnl18.name, from: 'Первая лига', to: '2-я лига «А» Золото', reason: '18-е место (вылет)' }
    );
  }
  if (goldRows.length >= 2) {
    const g1 = goldRows[0], g2 = goldRows[1];
    goldPromotedIds.push(g1.id, g2.id);
    report.promotions.push(
      { team: g1.name, from: '2-я лига «А» Золото', to: 'Первая лига', reason: '1-е место (прямой выход)' },
      { team: g2.name, from: '2-я лига «А» Золото', to: 'Первая лига', reason: '2-е место (прямой выход)' }
    );
  }

  // Полугодичная ротация: Золото ⇄ Серебро (4 худших ⇄ 4 лучших)
  const goldToSilverIds: string[] = [];
  const silverToGoldIds: string[] = [];
  if (goldRows.length >= 10) {
    const gDown = goldRows.slice(6, 10);
    gDown.forEach(t => {
      goldToSilverIds.push(t.id);
      report.relegations.push({ team: t.name, from: 'Группа «Золото»', to: 'Группа «Серебро»', reason: '7–10 места (ротация)' });
    });
  }
  if (silverRows.length >= 4) {
    const sUp = silverRows.slice(0, 4);
    sUp.forEach(t => {
      silverToGoldIds.push(t.id);
      report.promotions.push({ team: t.name, from: 'Группа «Серебро»', to: 'Группа «Золото»', reason: '1–4 места (ротация)' });
    });
  }

  // Серебро ⇄ Вторая лига «Б»
  const silverDownIds: string[] = [];
  const bUpIds: string[] = [];
  if (silverRows.length >= 7) {
    const sOut = silverRows.slice(Math.max(0, silverRows.length - 4));
    sOut.forEach(t => {
      silverDownIds.push(t.id);
      report.relegations.push({ team: t.name, from: 'Группа «Серебро»', to: 'Вторая лига «Б»', reason: 'Вылет из дивизиона «А»' });
    });
  }
  [b1Rows[0], b2Rows[0], b3Rows[0], b4Rows[0]].filter(Boolean).forEach((bTeam, idx) => {
    bUpIds.push(bTeam.id);
    report.promotions.push({ team: bTeam.name, from: `2-я лига Б (Группа ${idx + 1})`, to: 'Группа «Серебро»', reason: 'Победитель группы' });
  });

  // Применяем изменения
  for (const t of db.teams) {
    if (rplRelegatedIds.includes(t.id)) t.comp = 'fnl';
    else if (fnlPromotedIds.includes(t.id)) t.comp = 'rpl';
    else if (fnlRelegatedIds.includes(t.id)) t.comp = '2la_gold';
    else if (goldPromotedIds.includes(t.id)) t.comp = 'fnl';
    else if (goldToSilverIds.includes(t.id)) t.comp = '2la_silver';
    else if (silverToGoldIds.includes(t.id)) t.comp = '2la_gold';
    else if (silverDownIds.includes(t.id)) t.comp = '2lb_1';
    else if (bUpIds.includes(t.id)) t.comp = '2la_silver';
  }

  genSeason('2027-07-20', nextSeason);
  save();

  return { ok: 1, currentSeason, nextSeason, report };
}

/* ───────── HTTP и API ───────── */
export const app = express();
app.use(express.json({ limit: '5mb' }));

app.use((req: any, res: Response, next: NextFunction) => {
  const token = req.headers['x-token'] as string;
  req.me = token ? db.sessions[token] : null;
  next();
});

const admin = (req: any, res: Response, next: NextFunction) => req.me?.role === 'admin' ? next() : res.status(403).json({ error: 'Нужен вход администратора' });
const clubOf = (req: any) => req.me?.role === 'admin' ? (req.body?.teamId || req.query.teamId) : req.me?.teamId;
const needClub = (req: any, res: Response, next: NextFunction) => {
  const t = clubOf(req);
  if (!t || !team(t)) return res.status(403).json({ error: 'Войдите по коду клуба' });
  req.tid = t;
  next();
};
const fail = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });

function getCoachForTeam(tid: string): Coach {
  const t = team(tid);
  if (!t) return getTeamCoach('Неизвестный клуб', 'rpl');
  if (db.coaches && db.coaches[tid]) {
    return { ...db.coaches[tid], clubName: t.name };
  }
  return getTeamCoach(t.name, t.comp);
}

const pubTeam = (t: any) => {
  const official = getTeamLogo(t.name, null, t.comp);
  const coach = getCoachForTeam(t.id);
  const synergy = computeCoachSynergy(coach, db.tactics[t.id]);
  return {
    id: t.id,
    name: t.name,
    comp: t.comp,
    city: t.city,
    stadium: t.stadium,
    logo: official.startsWith('/assets/') ? official : (t.logo || official),
    colors: getTeamColors(t.name),
    coach,
    synergy
  };
};

const pubPlayer = (p: any) => ({
  id: p.id,
  name: p.name,
  pos: p.pos,
  born: p.born,
  teamId: p.teamId,
  team: p.teamId ? tn(p.teamId) : 'без клуба',
  teamLogo: p.teamId ? teamLogo(p.teamId) : null,
  style: p.style,
  achievements: p.achievements,
  out: p.out,
  banLeft: p.banLeft
});

const pubFx = (f: any) => ({
  id: f.id,
  comp: f.comp,
  round: f.round,
  label: roundLabel(f),
  date: f.date,
  time: f.time,
  home: f.home,
  away: f.away,
  homeName: tn(f.home),
  awayName: tn(f.away),
  homeLogo: teamLogo(f.home),
  awayLogo: teamLogo(f.away),
  status: f.status,
  hg: f.hg,
  ag: f.ag,
  pen: f.pen || null,
  full: f.status === 'live' || f.status === 'done' ? !!f.st || f.status === 'live' : fullSim(f),
  derby: !!db.derbies.find((d: any) => (d.a === f.home && d.b === f.away) || (d.a === f.away && d.b === f.home))
});

app.post('/api/login', (req, res) => {
  const c = String(req.body.code || '').trim().toUpperCase();
  if (!c) return fail(res, 'Введите код');
  let s: any = null;
  if (c === String(process.env.ADMIN_CODE || db.settings.adminCode).toUpperCase()) s = { role: 'admin' };
  else {
    const t = db.teams.find((t: any) => t.code && t.code.toUpperCase() === c);
    if (t) s = { role: 'club', teamId: t.id };
  }
  if (!s) return fail(res, 'Код не найден', 401);
  const token = crypto.randomBytes(20).toString('hex');
  db.sessions[token] = { ...s, at: Date.now() };
  save();
  res.json({ token, ...s, team: s.teamId ? pubTeam(team(s.teamId)) : null });
});

app.post('/api/logout', (req, res) => {
  const token = req.headers['x-token'] as string;
  if (token) delete db.sessions[token];
  save();
  res.json({ ok: 1 });
});

app.get('/api/state', (req: any, res) => {
  res.json({
    season: S(),
    comps: db.comps,
    teams: db.teams.map(pubTeam),
    me: req.me ? { role: req.me.role, teamId: req.me.teamId || null } : null,
    hasLLM: hasLLM(),
    live: db.fixtures.filter((f: any) => f.status === 'live').map(pubFx),
    regulations: LEAGUE_REGULATIONS
  });
});

app.get('/api/regulations', (req, res) => res.json(LEAGUE_REGULATIONS));
app.get('/api/regulations/:comp', (req, res) => {
  const k = req.params.comp.startsWith('2lb_') ? '2lb' : req.params.comp;
  res.json(LEAGUE_REGULATIONS[k] || {});
});

app.get('/api/table/:comp', (req, res) => res.json(table(req.params.comp)));

app.get('/api/fixtures', (req, res) => {
  let l = seasonFx();
  if (req.query.comp) l = l.filter((f: any) => f.comp === req.query.comp);
  if (req.query.team) l = l.filter((f: any) => f.home === req.query.team || f.away === req.query.team);
  l = l.sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(l.map(pubFx));
});

app.get('/api/match/:id', (req: any, res) => {
  const f = fx(req.params.id);
  if (!f) return fail(res, 'Матч не найден', 404);
  const m = getMatch(f.id);
  const isAdm = req.me?.role === 'admin';
  const HName = tn(f.home), AName = tn(f.away);
  const coachHome = getCoachForTeam(f.home);
  const coachAway = getCoachForTeam(f.away);
  const out: any = {
    fixture: pubFx(f),
    events: [],
    stats: null,
    lineups: null,
    ctx: null,
    final: null,
    err: isAdm ? f.err : undefined,
    fallback: !!f.fallback,
    motm: m?.motm || (f.status === 'done' && m ? getMatchMotm(m, f, HName, AName, coachHome, coachAway) : (f.motm ? { ...f.motm, teamName: HName, pos: 'НАП', interview: { headline: `«${f.motm.name}: игра была напряжённой до последних минут»`, quote: `Мы готовились к трудному матчу, соперник оказал серьезное сопротивление. Рады победе и поддержке трибун!`, tacticsComment: `Установка тренера была ясна: надёжность сзади и острота впереди.`, mood: 'satisfied' } } : null)),
    ratings: m?.ratings || (f.status === 'done' && m ? computeMatchRatings(m, f, HName, AName) : []),
    coaches: {
      home: { coach: coachHome, synergy: computeCoachSynergy(coachHome, db.tactics[f.home]) },
      away: { coach: coachAway, synergy: computeCoachSynergy(coachAway, db.tactics[f.away]) }
    }
  };
  if (m && (f.status === 'live' || f.status === 'done')) {
    out.events = f.status === 'live' ? m.events.slice(0, f.pos) : m.events;
    out.stats = f.status === 'done' ? m.stats : computeStats(out.events, m.ctx);
    const show = isAdm || f.status === 'done' || f.status === 'live';
    if (show) {
      out.lineups = {};
      for (const s of ['home', 'away']) {
        const L = m.ctx.lineup[s];
        out.lineups[s] = {
          name: m.ctx.sides[s].name,
          logo: m.ctx.sides[s].logo || teamLogo(f[s]),
          formation: L.formation,
          speech: L.speech,
          training: isAdm || f.status === 'done' ? L.training : undefined,
          starters: L.starters.map((id: string) => ({ id, name: m.ctx.names[id], pos: m.ctx.pos[id] })),
          bench: L.bench.map((id: string) => ({ id, name: m.ctx.names[id], pos: m.ctx.pos[id] }))
        };
      }
    }
    out.ctx = {
      comp: m.ctx.comp,
      roundLabel: m.ctx.roundLabel,
      stadium: m.ctx.stadium,
      weather: m.ctx.weather,
      derby: m.ctx.derby,
      motiv: m.ctx.motiv
    };
    if (isAdm) {
      out.ctx.prompt = m.ctx.prompt1;
      out.ctx.fat = m.ctx.fat;
      out.ctx.race = m.ctx.race;
    }
  }
  res.json(out);
});

// Послематчевое интервью игрока
app.post('/api/match/:id/interview', async (req: any, res) => {
  const f = fx(req.params.id);
  if (!f || f.status !== 'done') return fail(res, 'Матч ещё не завершён');
  const m = getMatch(f.id);
  const HName = tn(f.home), AName = tn(f.away);
  const cH = getCoachForTeam(f.home), cA = getCoachForTeam(f.away);
  const motm = m?.motm || (m ? getMatchMotm(m, f, HName, AName, cH, cA) : null);
  if (!motm) return fail(res, 'Нет данных о лучшем игроке');
  const question = String(req.body.question || 'Как прокомментируете исход встречи и свою игру?').trim();

  if (hasLLM()) {
    try {
      const prompt = `Ты — лучший игрок матча ${motm.name} (${motm.pos}, клуб ${motm.teamName}). Матч: ${HName} ${f.hg}:${f.ag} ${AName} (${roundLabel(f)}). Журналист на флеш-интервью спрашивает: "${question}". Ответь живо, эмоционально, сдержанно или воодушевленно в 2-4 предложениях от первого лица.`;
      const ans = await llmText(prompt, { temp: 0.8, max: 500 });
      return res.json({ question, answer: ans.trim(), player: motm.name });
    } catch {}
  }
  return res.json({
    question,
    answer: `«${question.includes('удар') || question.includes('гол') ? 'В моменте с голом просто принял решение бить в угол, главное было попасть в створ. ' : ''}Мы готовились к тяжёлой борьбе. Тренер указал на ключевые зоны, мы старались строго выполнить установку и рады подарить эмоции нашим фанатам!»`,
    player: motm.name
  });
});

// Кубок России 2026/2027: структура, группы Пути РПЛ, Путь регионов и плей-офф
app.get('/api/cup/structure', (req, res) => {
  if (!db.cupState2026) advanceCup();
  recalculateCupGroups(db.cupState2026, seasonFx());
  const cupMatches = seasonFx().filter((f: any) => f.comp === 'cup').map(pubFx);
  res.json({
    state: db.cupState2026,
    fixtures: cupMatches,
    teams: db.teams.map(pubTeam)
  });
});

// Тренеры
app.get('/api/coaches', (req, res) => {
  const list = db.teams.map((t: any) => {
    const coach = getCoachForTeam(t.id);
    const synergy = computeCoachSynergy(coach, db.tactics[t.id]);
    return {
      teamId: t.id,
      teamName: t.name,
      comp: t.comp,
      logo: teamLogo(t.id),
      coach,
      synergy
    };
  });
  res.json(list);
});

app.get('/api/coach/:teamId', (req, res) => {
  const t = team(req.params.teamId);
  if (!t) return fail(res, 'Клуб не найден', 404);
  const coach = getCoachForTeam(t.id);
  const synergy = computeCoachSynergy(coach, db.tactics[t.id]);
  res.json({ team: pubTeam(t), coach, synergy });
});

app.post('/api/coach/:teamId', admin, (req, res) => {
  const t = team(req.params.teamId);
  if (!t) return fail(res, 'Клуб не найден', 404);
  const cur = getCoachForTeam(t.id);
  const b = req.body;
  db.coaches ||= {};
  db.coaches[t.id] = {
    ...cur,
    name: b.name ? String(b.name).trim() : cur.name,
    style: b.style && ['bus', 'counter', 'possession', 'attack', 'press'].includes(b.style) ? b.style : cur.style,
    favoriteFormation: b.favoriteFormation || cur.favoriteFormation,
    reputation: Number(b.reputation) || cur.reputation,
    temperament: b.temperament || cur.temperament,
    quote: b.quote || cur.quote
  };
  save();
  res.json({ ok: 1, coach: db.coaches[t.id] });
});

// Сборные и награды (Awards)
app.get('/api/awards/round', (req, res) => {
  const comp = String(req.query.comp || 'rpl');
  const compFx = seasonFx().filter((f: any) => f.comp === comp && f.status === 'done');
  const rounds = [...new Set(compFx.map((f: any) => roundLabel(f)))];
  const requestedRound = String(req.query.round || rounds[rounds.length - 1] || '1-й тур');

  const matchesMap: Record<string, any> = {};
  for (const f of compFx) {
    const m = getMatch(f.id);
    if (m) matchesMap[f.id] = m;
  }
  const teamsMap = Object.fromEntries(db.teams.map((t: any) => [t.id, pubTeam(t)]));

  const teamOfRound = buildTeamOfRound(requestedRound, comp, compFx, matchesMap, teamsMap);
  res.json({
    comp,
    availableRounds: rounds,
    selectedRound: requestedRound,
    teamOfRound
  });
});

app.get('/api/awards/month', (req, res) => {
  const comp = String(req.query.comp || 'rpl');
  const compFx = seasonFx().filter((f: any) => f.comp === comp && f.status === 'done');
  const months = [...new Set(compFx.map((f: any) => (f.date || '').slice(0, 7)).filter(Boolean))].sort();
  const requestedMonth = String(req.query.month || months[months.length - 1] || '2026-08');

  const matchesMap: Record<string, any> = {};
  for (const f of compFx) {
    const m = getMatch(f.id);
    if (m) matchesMap[f.id] = m;
  }
  const teamsMap = Object.fromEntries(db.teams.map((t: any) => [t.id, pubTeam(t)]));

  const teamOfMonth = buildTeamOfMonth(requestedMonth, comp, compFx, matchesMap, teamsMap);
  res.json({
    comp,
    availableMonths: months,
    selectedMonth: requestedMonth,
    teamOfMonth
  });
});

app.get('/api/awards/season', (req, res) => {
  const comp = String(req.query.comp || 'rpl');
  const A = agg();
  const P = Object.values<any>(A.P).filter(x => x.comp === comp);
  const rows = table(comp);

  const topScorer = [...P].sort((a, b) => b.g - a.g || b.min - a.min)[0] || null;
  const topAssister = [...P].sort((a, b) => b.a - a.a || b.min - a.min)[0] || null;
  const bestGk = [...P].filter(p => p.cs > 0 || p.sv > 0).sort((a, b) => b.cs - a.cs || b.sv - a.sv)[0] || null;

  const championTeam = rows[0] ? team(rows[0].id) : null;
  const coachOfSeason = championTeam ? {
    coach: getCoachForTeam(championTeam.id),
    teamName: championTeam.name,
    teamLogo: teamLogo(championTeam.id),
    title: 'Тренер года',
    reason: `Привёл команду «${championTeam.name}» к чемпионскому титулу`
  } : null;

  const matchesMap: Record<string, any> = {};
  for (const f of seasonFx().filter((f: any) => f.comp === comp && f.status === 'done')) {
    const m = getMatch(f.id);
    if (m) matchesMap[f.id] = m;
  }
  const teamsMap = Object.fromEntries(db.teams.map((t: any) => [t.id, pubTeam(t)]));
  const allMonths = [...new Set(seasonFx().map((f: any) => (f.date || '').slice(0, 7)).filter(Boolean))].sort();
  const latestMonth = allMonths[allMonths.length - 1] || '2026-08';
  const teamOfSeason = buildTeamOfMonth(latestMonth, comp, seasonFx(), matchesMap, teamsMap);

  res.json({
    comp,
    season: S(),
    topScorer: topScorer ? { ...topScorer, team: tn(topScorer.t), logo: teamLogo(topScorer.t) } : null,
    topAssister: topAssister ? { ...topAssister, team: tn(topAssister.t), logo: teamLogo(topAssister.t) } : null,
    bestGk: bestGk ? { ...bestGk, team: tn(bestGk.t), logo: teamLogo(bestGk.t) } : null,
    coachOfSeason,
    teamOfSeason
  });
});

app.post('/api/admin/season/rotate', admin, (req, res) => {
  const result = performSeasonRotation();
  res.json(result);
});

app.get('/api/live/:id', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  res.write('data: {"type":"hello"}\n\n');
  const l = live[req.params.id] ||= { clients: new Set() };
  l.clients.add(res);
  const ka = setInterval(() => res.write(': ka\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ka);
    l.clients.delete(res);
  });
});

app.get('/api/leaders', (req, res) => {
  const comp = String(req.query.comp || 'rpl');
  const A = agg();
  const P = Object.values<any>(A.P).filter(x => x.comp === comp).map(x => ({
    ...x,
    team: tn(x.t),
    teamLogo: teamLogo(x.t),
    xg: +x.xg.toFixed(2)
  }));
  const T = Object.values<any>(A.T).filter(x => x.comp === comp).map(x => ({
    ...x,
    team: tn(x.tid),
    teamLogo: teamLogo(x.tid),
    xg: +x.xg.toFixed(2),
    xga: +x.xga.toFixed(2)
  }));
  res.json({ players: P, teams: T });
});

app.get('/api/players/search', (req, res) => {
  const q = norm(req.query.q);
  if (q.length < 2) return res.json([]);
  res.json(db.players.filter((p: any) => norm(p.name).includes(q)).sort((a: any, b: any) => (norm(a.name).startsWith(q) ? 0 : 1) - (norm(b.name).startsWith(q) ? 0 : 1)).slice(0, 12).map(pubPlayer));
});

app.get('/api/derbies', (req, res) => {
  res.json(db.derbies.map((d: any) => ({
    ...d,
    aName: tn(d.a),
    bName: tn(d.b),
    aLogo: teamLogo(d.a),
    bLogo: teamLogo(d.b)
  })));
});

/* — клуб — */
app.get('/api/club', needClub, (req: any, res) => {
  const t = team(req.tid), sq = squadOf(req.tid);
  const today = new Date().toISOString().slice(0, 10);
  const up = seasonFx().filter((f: any) => (f.home === req.tid || f.away === req.tid) && f.status === 'scheduled').sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  res.json({
    team: { ...pubTeam(t), code: req.me.role === 'admin' ? t.code : undefined },
    squadMax: db.settings.squadMax,
    squadSubmitted: !!db.squads[req.tid],
    squad: sq.map((p: any) => ({ ...pubPlayer(p), available: isAvail(p, today), card: p })),
    tactic: db.tactics[req.tid] || null,
    upcoming: up.map((f: any) => ({
      ...pubFx(f),
      lineup: db.lineups[f.id + ':' + req.tid] || null,
      auto: getLineup(f, req.tid),
      opp: tn(f.home === req.tid ? f.away : f.home),
      oppLogo: teamLogo(f.home === req.tid ? f.away : f.home)
    })),
    transfers: db.transfers.filter((x: any) => x.to === req.tid).slice(-10)
  });
});

app.post('/api/club/squad/add', needClub, async (req: any, res) => {
  try {
    let p: any;
    if (req.body.playerId) {
      p = player(req.body.playerId);
    } else {
      [p] = await createPlayers([req.body.name], null, req.body.hint);
      if (p && req.body.pos && POSES.includes(req.body.pos) && !p.verified) p.pos = req.body.pos;
    }
    if (!p) return fail(res, 'Игрок не найден');
    const cur = squadOf(req.tid);
    if (cur.some((x: any) => x.id === p.id)) return res.json({ ok: 1 });
    if (cur.length >= db.settings.squadMax) return fail(res, `В заявке максимум ${db.settings.squadMax} игроков`);
    const owner = p.teamId && p.teamId !== req.tid && team(p.teamId) && (team(p.teamId).code || squadOf(p.teamId).length);
    if (owner && req.me.role !== 'admin') {
      db.transfers.push({ id: uid(), pid: p.id, from: p.teamId, to: req.tid, status: 'pending', note: String(req.body.note || '').slice(0, 300), at: Date.now() });
      save();
      return res.json({ pending: 1, message: `${p.name} числится в «${tn(p.teamId)}». Заявка на трансфер отправлена админу.` });
    }
    p.teamId = req.tid;
    db.squads[req.tid] = [...cur.map((x: any) => x.id), p.id];
    save();
    res.json({ ok: 1, player: pubPlayer(p) });
  } catch (e: any) {
    fail(res, e.message);
  }
});

app.post('/api/club/squad/remove', needClub, (req: any, res) => {
  const cur = squadOf(req.tid).filter((p: any) => p.id !== req.body.playerId);
  db.squads[req.tid] = cur.map((p: any) => p.id);
  const p = player(req.body.playerId);
  if (p && p.teamId === req.tid) p.teamId = null;
  save();
  res.json({ ok: 1 });
});

app.post('/api/club/squad/submit', needClub, (req: any, res) => {
  db.squads[req.tid] = squadOf(req.tid).map((p: any) => p.id);
  save();
  res.json({ ok: 1 });
});

app.post('/api/club/lineup', needClub, (req: any, res) => {
  const f = fx(req.body.fid);
  if (!f || (f.home !== req.tid && f.away !== req.tid)) return fail(res, 'Это не матч вашего клуба');
  if (f.status !== 'scheduled') return fail(res, 'Матч уже начался — состав закрыт');
  const sq = new Set(squadOf(req.tid).map((p: any) => p.id));
  const st = (req.body.starters || []).filter((id: string) => sq.has(id));
  if (new Set(st).size !== st.length) return fail(res, 'Игрок указан дважды');
  if (st.length !== 11) return fail(res, 'В старте должно быть ровно 11 игроков');
  if (!st.some((id: string) => player(id)?.pos === 'ВР')) return fail(res, 'В старте нужен вратарь');
  const bad = st.map(player).filter((p: any) => !isAvail(p, f.date));
  if (bad.length) return fail(res, `Недоступны: ${bad.map((p: any) => p.name).join(', ')}`);
  const fm = /^\d(-\d){1,3}$/.test(req.body.formation || '') ? req.body.formation : '4-3-3';
  const bench = (req.body.bench || []).filter((id: string) => sq.has(id) && !st.includes(id)).slice(0, 12);
  const L = {
    formation: fm,
    starters: st,
    bench,
    speech: String(req.body.speech || '').slice(0, 4000),
    training: String(req.body.training || '').slice(0, 4000),
    at: Date.now()
  };
  db.lineups[f.id + ':' + req.tid] = L;
  db.tactics[req.tid] = { ...L };
  save();
  res.json({ ok: 1 });
});

/* — админ — */
app.get('/api/admin/overview', admin, (req, res) => {
  res.json({
    teams: db.teams.map((t: any) => ({
      ...pubTeam(t),
      squad: squadOf(t.id).length,
      submitted: !!db.squads[t.id],
      code: t.code
    })),
    settings: {
      ...db.settings,
      keys: undefined,
      tgToken: db.settings.tgToken ? '••••' : '',
      adminCode: db.settings.adminCode,
      systemPrompt: db.settings.systemPrompt || SYS_DEFAULT
    },
    keys: {
      gemini: !!(process.env.GEMINI_API_KEY || db.settings.keys.gemini),
      groq: !!(process.env.GROQ_API_KEY || db.settings.keys.groq),
      openrouter: !!(process.env.OPENROUTER_API_KEY || db.settings.keys.openrouter)
    },
    models: db.settings.models,
    log: db.llmlog.slice(-25).reverse(),
    transfers: db.transfers.filter((t: any) => t.status === 'pending').map((t: any) => ({
      ...t,
      pName: player(t.pid)?.name,
      fromName: tn(t.from),
      toName: tn(t.to)
    }))
  });
});

app.post('/api/admin/settings', admin, (req, res) => {
  const b = req.body, s = db.settings;
  for (const k of ['season', 'siteUrl', 'tgChat']) if (typeof b[k] === 'string') s[k] = b[k].trim();
  if (typeof b.tgToken === 'string' && !b.tgToken.includes('•')) s.tgToken = b.tgToken.trim();
  for (const k of ['secPerMin', 'breakSec', 'squadMax']) if (b[k] !== undefined && +b[k] > 0) s[k] = +b[k];
  if (b.chunks !== undefined) s.chunks = +b.chunks === 6 ? 6 : 2;
  if (b.auto !== undefined) s.auto = !!b.auto;
  if (b.grounding !== undefined) s.grounding = !!b.grounding;
  if (typeof b.systemPrompt === 'string') s.systemPrompt = b.systemPrompt.trim() === SYS_DEFAULT.trim() ? '' : b.systemPrompt;
  for (const k of ['gemini', 'groq', 'openrouter']) {
    if (typeof b.keys?.[k] === 'string' && b.keys[k].trim()) s.keys[k] = b.keys[k].trim();
    if (b.keys?.[k] === '') delete s.keys[k];
    if (typeof b.models?.[k] === 'string') {
      if (b.models[k].trim()) s.models[k] = b.models[k].trim();
      else delete s.models[k];
    }
  }
  save();
  res.json({ ok: 1 });
});

app.post('/api/admin/season', admin, (req, res) => {
  let start = String(req.body.start || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return fail(res, 'Укажите дату старта (ГГГГ-ММ-ДД)');
  const name = String(req.body.name || S()).trim();
  if (seasonFx().length && db.settings.season === name && !req.body.force) {
    return fail(res, 'Для этого сезона расписание уже есть. Измените название сезона или подтвердите пересоздание.');
  }
  if (db.settings.season === name) db.fixtures = db.fixtures.filter((f: any) => f.season !== name);
  genSeason(start, name);
  res.json({ ok: 1, fixtures: seasonFx().length });
});

app.post('/api/admin/team', admin, (req, res) => {
  const b = req.body;
  let t = b.id && team(b.id);
  if (b.delete) {
    if (!t) return fail(res, 'Нет такой команды');
    if (db.fixtures.some((f: any) => f.home === t.id || f.away === t.id)) return fail(res, 'У команды есть матчи — удалять нельзя');
    db.teams = db.teams.filter((x: any) => x !== t);
    save();
    return res.json({ ok: 1 });
  }
  if (!String(b.name || '').trim()) return fail(res, 'Нужно название');
  if (!t) {
    t = { id: uid(), code: '' };
    db.teams.push(t);
  }
  const name = b.name.trim();
  const comp = db.comps.some((c: any) => c.id === b.comp) ? b.comp : 'rpl';
  const logo = b.logo ? b.logo.trim() : (t.logo || getTeamLogo(name, null, comp));
  Object.assign(t, {
    name,
    comp,
    logo,
    city: b.city || '',
    stadium: b.stadium || '',
    lat: b.lat === '' || b.lat == null ? t.lat ?? null : +b.lat,
    lon: b.lon === '' || b.lon == null ? t.lon ?? null : +b.lon
  });
  if (b.regen || (b.comp === 'rpl' && !t.code)) t.code = mkCode();
  if (b.clearCode) t.code = '';
  save();
  res.json({ ok: 1, team: pubTeam(t) });
});

app.post('/api/admin/import', admin, async (req, res) => {
  const names = String(req.body.names || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  if (!req.body.teamId || !team(req.body.teamId)) return fail(res, 'Выберите команду');
  if (!names.length) return fail(res, 'Вставьте список игроков');
  try {
    const out: any[] = [];
    for (let i = 0; i < names.length; i += 10) {
      out.push(...await createPlayers(names.slice(i, i + 10), req.body.teamId, team(req.body.teamId).name));
    }
    const tid = req.body.teamId;
    for (const p of out) p.teamId = tid;
    db.squads[tid] = [...new Set([...squadOf(tid).map((p: any) => p.id), ...out.map((p: any) => p.id)])];
    save();
    res.json({ ok: 1, added: out.length, verified: out.filter(p => p.verified).length });
  } catch (e: any) {
    fail(res, e.message);
  }
});

app.get('/api/admin/players', admin, (req, res) => {
  const q = norm(req.query.q || '');
  let l = db.players;
  if (req.query.teamId) l = l.filter((p: any) => p.teamId === req.query.teamId);
  if (q) l = l.filter((p: any) => norm(p.name).includes(q));
  res.json(l.slice(0, 300).map(pubPlayer));
});

app.post('/api/admin/player', admin, (req, res) => {
  const b = req.body;
  if (b.delete) {
    db.players = db.players.filter((p: any) => p.id !== b.id);
    for (const k of Object.keys(db.squads)) db.squads[k] = db.squads[k].filter((i: string) => i !== b.id);
    save();
    return res.json({ ok: 1 });
  }
  let p = b.id && player(b.id);
  if (!p) {
    p = cardFrom({ name: b.name }, { teamId: b.teamId });
    db.players.push(p);
  }
  for (const k of ['name', 'pos', 'born', 'nation', 'realClub', 'style', 'stats2y', 'form', 'character', 'news']) {
    if (typeof b[k] === 'string') p[k] = b[k];
  }
  if (b.achievements !== undefined) {
    p.achievements = Array.isArray(b.achievements) ? b.achievements : String(b.achievements).split('\n').map(s => s.trim()).filter(Boolean);
  }
  if ('teamId' in b) {
    p.teamId = b.teamId || null;
    if (p.teamId) {
      db.squads[p.teamId] = [...new Set([...squadOf(p.teamId).map((x: any) => x.id), p.id])];
    }
  }
  if ('out' in b) p.out = b.out && b.out.until ? b.out : null;
  if (b.banLeft !== undefined) p.banLeft = +b.banLeft || 0;
  p.updatedAt = new Date().toISOString();
  save();
  res.json({ ok: 1, player: p });
});

app.post('/api/admin/refresh', admin, async (req, res) => {
  const names = squadOf(req.body.teamId).map((p: any) => p.name);
  if (!hasLLM()) return fail(res, 'Нет ключей нейросети');
  let n = 0;
  try {
    for (let i = 0; i < names.length; i += 10) {
      const r = await llmJSON(CARD_SYS, `Игроки: ${names.slice(i, i + 10).map((x: any, j: number) => `${j + 1}. ${x}`).join('; ')}. Клуб: ${tn(req.body.teamId)}. Обнови актуальную форму и новости.`, { task: 'refresh', temp: 0.3, max: 8000, grounded: !!db.settings.grounding && provList()[0]?.n === 'gemini' });
      (r.players || []).forEach((c: any, j: number) => {
        const p = findPlayerByName(names[i + j]);
        if (p && c && c.found !== false) {
          for (const k of ['style', 'stats2y', 'form', 'character', 'news']) if (c[k]) p[k] = c[k];
          if (Array.isArray(c.achievements) && c.achievements.length) p.achievements = c.achievements;
          p.verified = true;
          p.updatedAt = new Date().toISOString();
          n++;
        }
      });
    }
    save();
    res.json({ ok: 1, updated: n });
  } catch (e: any) {
    fail(res, e.message);
  }
});

app.post('/api/admin/run', admin, async (req, res) => {
  const b = req.body;
  let list = seasonFx().filter((f: any) => f.status === 'scheduled');
  if (b.fid) list = list.filter((f: any) => f.id === b.fid);
  else if (b.date) list = list.filter((f: any) => f.date === b.date);
  else if (b.comp && b.round) list = list.filter((f: any) => f.comp === b.comp && f.round === +b.round);
  else if (b.upto) list = list.filter((f: any) => f.date <= b.upto);
  else return fail(res, 'Не указано, что запускать');
  if (!list.length) return fail(res, 'Нет матчей для запуска');
  res.json(await runBatch(list));
});

app.post('/api/admin/fixture', admin, (req, res) => {
  const f = fx(req.body.id);
  if (!f) return fail(res, 'Матч не найден');
  if (req.body.reset) {
    if (f.status === 'live') { clearTimeout(timers[f.id]); }
    Object.assign(f, { status: 'scheduled', hg: null, ag: null, pen: null, st: null, pos: 0, final: null, err: '' });
    try { fs.unlinkSync(path.join(MDIR, f.id + '.json')); } catch { }
    mcache.delete(f.id);
    invalidateAgg();
    save();
    return res.json({ ok: 1 });
  }
  if (f.status !== 'scheduled' && !req.body.force) return fail(res, 'Матч уже сыгран');
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '')) f.date = req.body.date;
  if (/^\d{2}:\d{2}$/.test(req.body.time || '')) f.time = req.body.time;
  if (req.body.hg !== undefined && req.body.ag !== undefined && f.status === 'scheduled') {
    f.hg = +req.body.hg;
    f.ag = +req.body.ag;
    f.status = 'done';
    f.st = null;
    if (f.comp === 'cup' && f.hg === f.ag) f.pen = shootout(f);
    invalidateAgg();
    advanceCup();
  }
  save();
  res.json({ ok: 1 });
});

app.get('/api/admin/lineups/:fid', admin, (req, res) => {
  const f = fx(req.params.fid);
  if (!f) return fail(res, 'Нет матча');
  const o: Record<string, any> = {};
  for (const s of ['home', 'away']) {
    const L = getLineup(f, f[s]);
    o[s] = {
      team: tn(f[s]),
      logo: teamLogo(f[s]),
      ...L,
      starters: L.starters.map((id: string) => player(id)?.name),
      bench: L.bench.map((id: string) => player(id)?.name)
    };
  }
  res.json(o);
});

app.post('/api/admin/derby', admin, (req, res) => {
  const b = req.body;
  if (b.delete) {
    db.derbies = db.derbies.filter((d: any) => d.id !== b.id);
    save();
    return res.json({ ok: 1 });
  }
  if (!team(b.a) || !team(b.b) || b.a === b.b) return fail(res, 'Выберите две разные команды');
  db.derbies.push({ id: uid(), a: b.a, b: b.b, name: b.name || 'Принципиальное противостояние', note: b.note || '' });
  save();
  res.json({ ok: 1 });
});

app.post('/api/admin/transfer', admin, (req, res) => {
  const t = db.transfers.find((x: any) => x.id === req.body.id);
  if (!t || t.status !== 'pending') return fail(res, 'Заявка не найдена');
  if (req.body.approve) {
    const p = player(t.pid);
    if (!p) return fail(res, 'Игрока нет');
    if (t.from && db.squads[t.from]) db.squads[t.from] = db.squads[t.from].filter((i: string) => i !== p.id);
    db.squads[t.to] = [...new Set([...squadOf(t.to).map((x: any) => x.id), p.id])];
    p.teamId = t.to;
    t.status = 'approved';
  } else {
    t.status = 'rejected';
  }
  save();
  res.json({ ok: 1 });
});

app.post('/api/admin/ask', admin, async (req, res) => {
  const f = fx(req.body.fid), m = f && getMatch(f.id);
  if (!m || f.status !== 'done') return fail(res, 'Сначала дождитесь конца матча');
  if (!req.body.question) return fail(res, 'Введите вопрос');
  if (!hasLLM()) return fail(res, 'Нужен ключ нейросети');
  const ev = m.events.map((e: any) => `${e.min}:${String(e.sec).padStart(2, '0')} [${e.type}] ${e.team} ${e.players.join(' / ')} — ${e.text}${e.xg ? ` (xG ${e.xg})` : ''}`).join('\n');
  const st = m.stats, H = m.ctx.sides.home.name, A = m.ctx.sides.away.name;
  const sys = 'Ты — аналитик симулятора «Вирт РПЛ». Отвечай на вопросы админа ТОЛЬКО по предоставленным данным матча (события, статистика, составы, контекст). Ссылайся на конкретные минуты и игроков. Если данных для ответа нет — так и скажи. Пиши по-русски, ясно и по делу.';
  const user = `МАТЧ ${H} ${f.hg}:${f.ag} ${A}${f.pen ? ` (пен. ${f.pen.hg}:${f.pen.ag})` : ''}. ${m.ctx.comp}, ${m.ctx.roundLabel}.\nКонтекст: ${m.ctx.motiv.home} | ${m.ctx.motiv.away} | Противостояние: ${m.ctx.derby} | Погода: ${m.ctx.weather}\nУсталость: ${m.ctx.fat.home} | ${m.ctx.fat.away}\nРечь ${H}: «${m.ctx.lineup.home.speech || 'молчание'}» Тренировки: «${m.ctx.lineup.home.training || '—'}»\nРечь ${A}: «${m.ctx.lineup.away.speech || 'молчание'}» Тренировки: «${m.ctx.lineup.away.training || '—'}»\nСхемы: ${m.ctx.lineup.home.formation} / ${m.ctx.lineup.away.formation}\nСтатистика: ${JSON.stringify(st.teams)} владение ${st.poss.join('-')}\nИгроки: ${Object.values<any>(st.players).map(p => `${p.n}: ${p.min}', ${p.g}г ${p.a}п ${p.sh}уд xG${p.xg} ${p.tk}отб ${p.sv}сейв ${p.yc}жк ${p.rc}кк`).join('; ')}\nСОБЫТИЯ:\n${ev}\n\nВОПРОС АДМИНА: ${req.body.question}`;
  try {
    res.json({ answer: (await llm(sys, user, { json: false, task: 'ask', temp: 0.4, max: 4000 })).trim() });
  } catch (e: any) {
    fail(res, e.message);
  }
});

/* ───────── старт и инициализация ───────── */
load();
invalidateAgg();
resumeLive();

setInterval(() => {
  if (!db.settings.auto) return;
  const now = new Date();
  const due = seasonFx().filter((f: any) => f.status === 'scheduled' && at(f) <= now);
  if (due.length) runBatch(due).catch(console.error);
}, 60000);

process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });

// Сервинг фронтенда: в dev через Vite middlewares, в prod через статику
async function startServer() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'))) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch {
      app.use(express.static(path.join(__dirname, 'public')));
      app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Вирт РПЛ запущен: http://localhost:${PORT}`);
    console.log(`Код администратора: ${process.env.ADMIN_CODE || db.settings.adminCode}`);
    if (!hasLLM()) {
      console.log('Ключей нейросети нет — симуляция работает на запасном генераторе. Добавьте ключ в настройках админки или через переменные окружения.');
    }
  });
}

// Запускаем сервер если запускается напрямую
startServer();

export { db };
