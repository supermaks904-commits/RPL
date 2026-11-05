/**
 * Официальный регламент соревнований и система ротации лиг российского футбола
 * Поддерживает реформу 2023–2026/2027:
 * - РПЛ ⇄ Первая лига (прямой вылет 15-16, прямые путевки 1-2, стыки 13-14 vs 4-3)
 * - Первая лига ⇄ 2Л «А» Золото (вылет 17-18, путевки 1-2 + 3 стыки)
 * - 2Л «А»: Золото ⇄ Серебро (внутренняя ротация каждые полгода: 4 худших ⇄ 4 лучших)
 * - 2Л «А» Серебро ⇄ 2Л «Б» (весна-осень: 4 худших Серебра ⇄ 4 победителя групп 1-4)
 * - 2Л «Б» ⇄ Третья лига (вылет худших/нелицензированных ⇄ победители регионов)
 */

export interface LeagueZoneRule {
  posFrom: number;
  posTo: number;
  zone: 'gold' | 'top' | 'playoff' | 'bad' | 'neutral';
  title: string;
  description: string;
  destinationComp?: string;
}

export interface CompetitionRegulation {
  id: string;
  name: string;
  tier: number;
  system: 'autumn-spring' | 'spring-autumn';
  totalTeams: number;
  zones: LeagueZoneRule[];
  rulesSummary: string[];
}

export const LEAGUE_REGULATIONS: Record<string, CompetitionRegulation> = {
  rpl: {
    id: 'rpl',
    name: 'Мир Российская Премьер-Лига (РПЛ)',
    tier: 1,
    system: 'autumn-spring',
    totalTeams: 16,
    zones: [
      {
        posFrom: 1,
        posTo: 1,
        zone: 'gold',
        title: 'Чемпион России',
        description: 'Золотые медали и кубок чемпионов России.'
      },
      {
        posFrom: 2,
        posTo: 3,
        zone: 'top',
        title: 'Призовая зона (Серебро и Бронза)',
        description: 'Призёры национального первенства.'
      },
      {
        posFrom: 4,
        posTo: 12,
        zone: 'neutral',
        title: 'Сохранение прописки',
        description: 'Клубы остаются в РПЛ на следующий сезон.'
      },
      {
        posFrom: 13,
        posTo: 14,
        zone: 'playoff',
        title: 'Переходные стыковые матчи',
        description: '13-е и 14-е места играют двухматчевые стыки против 4-го и 3-го мест Первой лиги. Ответный матч дома у клуба РПЛ. При ничьей — доп. время и пенальти (без правила гостевого гола).'
      },
      {
        posFrom: 15,
        posTo: 16,
        zone: 'bad',
        title: 'Прямой вылет в Первую лигу',
        description: '15-е и 16-е места напрямую выбывают в Первую лигу на следующий сезон.',
        destinationComp: 'fnl'
      }
    ],
    rulesSummary: [
      'Система: «осень-весна» (30 туров).',
      'Напрямую вылетают команды с 15-го и 16-го мест.',
      '13-е место РПЛ играет стыки против 4-го места Первой лиги.',
      '14-е место РПЛ играет стыки против 3-го места Первой лиги.',
      'Формат стыков: 2 матча (1-й в Первой лиге, 2-й в РПЛ). Ничья -> экстра-таймы (2×15) -> серия пенальти. Без правила выездного гола.'
    ]
  },
  fnl: {
    id: 'fnl',
    name: 'Первая лига (МЕЛБЕТ-Первая Лига)',
    tier: 2,
    system: 'autumn-spring',
    totalTeams: 18,
    zones: [
      {
        posFrom: 1,
        posTo: 2,
        zone: 'top',
        title: 'Прямой выход в РПЛ',
        description: '1-е и 2-е места получают прямые путёвки в Премьер-Лигу.',
        destinationComp: 'rpl'
      },
      {
        posFrom: 3,
        posTo: 4,
        zone: 'playoff',
        title: 'Стыковые матчи за выход в РПЛ',
        description: '3-е место играет с 14-м местом РПЛ, 4-е место играет с 13-м местом РПЛ.'
      },
      {
        posFrom: 5,
        posTo: 16,
        zone: 'neutral',
        title: 'Сохранение прописки',
        description: 'Клубы остаются в Первой лиге на следующий сезон.'
      },
      {
        posFrom: 17,
        posTo: 18,
        zone: 'bad',
        title: 'Вылет во Вторую лигу «А»',
        description: '17-е и 18-е места опускаются во Вторую лигу дивизион «А».',
        destinationComp: '2la_gold'
      }
    ],
    rulesSummary: [
      'Система: «осень-весна» (34 тура).',
      '1-е и 2-е места выходят в РПЛ напрямую.',
      '3-е и 4-е места выходят в переходные стыки против 14-го и 13-го мест РПЛ.',
      '17-е и 18-е места опускаются во Вторую лигу «А».'
    ]
  },
  '2la_gold': {
    id: '2la_gold',
    name: 'Вторая лига «А» · Группа «Золото»',
    tier: 3,
    system: 'autumn-spring',
    totalTeams: 10,
    zones: [
      {
        posFrom: 1,
        posTo: 2,
        zone: 'top',
        title: 'Прямой выход в Первую лигу',
        description: '1-е и 2-е места по итогам весеннего этапа получают прямые путёвки в Первую лигу.',
        destinationComp: 'fnl'
      },
      {
        posFrom: 3,
        posTo: 3,
        zone: 'playoff',
        title: 'Стыковой матч / Прямой выход в Первую лигу',
        description: '3-е место группы «Золото» получает право сыграть стыковые матчи за повышение или выходит напрямую (если победитель осени уже в топ-2).'
      },
      {
        posFrom: 4,
        posTo: 6,
        zone: 'neutral',
        title: 'Сохранение в группе «Золото»',
        description: 'Команды сохраняют место в сильнейшей группе дивизиона «А».'
      },
      {
        posFrom: 7,
        posTo: 10,
        zone: 'bad',
        title: 'Вылет в группу «Серебро»',
        description: '4 худшие команды опускаются в группу «Серебро» на следующий полугодичный этап.',
        destinationComp: '2la_silver'
      }
    ],
    rulesSummary: [
      'Двухэтапная система: осень и весна (по 10 команд).',
      'Весной: 1-е и 2-е места группы «Золото» напрямую поднимаются в Первую лигу.',
      '3-е место группы «Золото» играет стыки за выход в Первую лигу.',
      'Каждые полгода: 4 худшие команды (7–10 места) опускаются в «Серебро».'
    ]
  },
  '2la_silver': {
    id: '2la_silver',
    name: 'Вторая лига «А» · Группа «Серебро»',
    tier: 3,
    system: 'autumn-spring',
    totalTeams: 10,
    zones: [
      {
        posFrom: 1,
        posTo: 4,
        zone: 'top',
        title: 'Повышение в группу «Золото»',
        description: '4 лучшие команды (1–4 места) поднимаются в группу «Золото» дивизиона «А».',
        destinationComp: '2la_gold'
      },
      {
        posFrom: 5,
        posTo: 6,
        zone: 'neutral',
        title: 'Сохранение в группе «Серебро»',
        description: 'Команды остаются в группе «Серебро».'
      },
      {
        posFrom: 7,
        posTo: 10,
        zone: 'bad',
        title: 'Вылет во Вторую лигу «Б»',
        description: '4 худшие команды по итогам весеннего этапа (7–10 места) выбывают в дивизион «Б».',
        destinationComp: '2lb'
      }
    ],
    rulesSummary: [
      'Каждые полгода: 4 лучшие команды (1–4 места) выходят в группу «Золото».',
      'По итогам весеннего этапа: 4 худшие команды (7–10 места) выбывают во Вторую лигу «Б».',
      'Обмен с дивизионом «Б» происходит по итогам года (стыков нет, прямой обмен).'
    ]
  },
  '2lb': {
    id: '2lb',
    name: 'Вторая лига «Б» (Дивизион «Б»)',
    tier: 4,
    system: 'spring-autumn',
    totalTeams: 60,
    zones: [
      {
        posFrom: 1,
        posTo: 1,
        zone: 'top',
        title: 'Прямой выход в дивизион «А» («Серебро»)',
        description: 'Победитель каждой из 4 групп напрямую поднимается в группу «Серебро» дивизиона «А».',
        destinationComp: '2la_silver'
      },
      {
        posFrom: 2,
        posTo: 14,
        zone: 'neutral',
        title: 'Сохранение места в группе',
        description: 'Команды продолжают выступление во Второй лиге «Б».'
      },
      {
        posFrom: 15,
        posTo: 16,
        zone: 'bad',
        title: 'Зона вылета в Третью лигу',
        description: 'Аутсайдеры групп или клубы без лицензии РФС опускаются в любительскую Третью лигу.'
      }
    ],
    rulesSummary: [
      'Система: «весна-осень» (март—ноябрь). 4 географические группы (Юг, Запад, Центр, Урал-Сибирь).',
      'Победители всех 4 групп (1-е места) напрямую выходят в группу «Серебро» дивизиона «А».',
      'Стыков между «А» и «Б» нет из-за разницы календарей.',
      'Худшие команды выбывают в любительскую Третью лигу.'
    ]
  },
  media: {
    id: 'media',
    name: 'Winline Медийная Футбольная Лига (MFL)',
    tier: 5,
    system: 'autumn-spring',
    totalTeams: 16,
    zones: [
      {
        posFrom: 1,
        posTo: 4,
        zone: 'top',
        title: 'Выход в полуфинал плей-офф',
        description: 'Топ-4 команды регулярного сезона напрямую выходят в стадию плей-офф за чемпионский титул.'
      },
      {
        posFrom: 5,
        posTo: 8,
        zone: 'playoff',
        title: 'Квалификационный раунд плей-офф',
        description: 'Стыковые матчи за путевки в четвертьфинал MFL.'
      },
      {
        posFrom: 9,
        posTo: 16,
        zone: 'neutral',
        title: 'Вне зоны плей-офф',
        description: 'Команды завершают борьбу в регулярном сезоне.'
      }
    ],
    rulesSummary: [
      'Медийный футбол с чисто игровым временем, красными мячами и буллиталити.',
      'Топ-4 выходят в 1/2 финала плей-офф.',
      '5–8 места играют стыковые матчи за четвертьфиналы.'
    ]
  }
};

/**
 * Определение зоны для конкретной позиции в таблице
 */
export function getTeamZoneClass(compId: string, pos: number, totalTeams: number): {
  zoneClass: string;
  badgeLabel?: string;
  tooltip?: string;
} {
  const compKey = compId.startsWith('2lb_') ? '2lb' : compId;
  const reg = LEAGUE_REGULATIONS[compKey];
  if (!reg) return { zoneClass: '' };

  for (const z of reg.zones) {
    const maxPos = z.posTo > totalTeams ? totalTeams : z.posTo;
    if (pos >= z.posFrom && pos <= maxPos) {
      if (z.zone === 'gold') return { zoneClass: 'zone-gold', badgeLabel: 'Золото', tooltip: z.title };
      if (z.zone === 'top') return { zoneClass: 'zone-top', badgeLabel: 'Выход', tooltip: z.title };
      if (z.zone === 'playoff') return { zoneClass: 'zone-playoff', badgeLabel: 'Стыки', tooltip: z.title };
      if (z.zone === 'bad') return { zoneClass: 'zone-bad', badgeLabel: 'Вылет', tooltip: z.title };
      return { zoneClass: '' };
    }
  }

  // Общие правила для групп 2ЛБ по последнему месту
  if (compKey === '2lb' && pos >= totalTeams) {
    return { zoneClass: 'zone-bad', badgeLabel: 'Вылет', tooltip: 'Зона вылета в Третью лигу' };
  }

  return { zoneClass: '' };
}
