/**
 * Кубок России по футболу (Сезон 2026/2027)
 * Официальный свежий регламент турнира с Путем РПЛ и Путем регионов
 *
 * 🏆 ТРИ СТАДИИ ТУРНИРА:
 * 1. Групповой этап и отборочные раунды (лето-осень):
 *    - Путь РПЛ: 16 клубов РПЛ в 4 группах по 4 команды (A, B, C, D), 6 туров.
 *      1-2 места -> верхняя сетка плей-офф Пути РПЛ (с правом на ошибку)
 *      3 место -> нижняя сетка Пути регионов (на выбывание)
 *      4 место -> выбывает
 *    - Путь регионов: 6 отборочных раундов на выбывание (по 1 матчу).
 *      1-3 раунды: клубы 2-й лиги и Медиалиги (MFL)
 *      4 раунд: стартуют 18 клубов Первой лиги
 *      5-6 раунды: выход в весеннюю стадию
 * 2. Плей-офф (весна):
 *    - Начинается с 1/8 финала!
 *    - Путь РПЛ: 1/8, 1/4, 1/2 финала — 2 матча (дома и в гостях).
 *      1-й матч дома в 1/8 у 2-х мест групп, в 1/4 и 1/2 — у набравших меньше очков.
 *      Проигравшие переходят в сетку Пути регионов.
 *    - Путь регионов: матчи на вылет из 1 игры. В паре с клубом РПЛ хозяин всегда клуб не из РПЛ.
 * 3. Финал (6 июня 2027): 1 матч победителя Пути РПЛ против победителя Пути регионов.
 */

export interface CupGroupTeamRow {
  id: string;
  name: string;
  pos: number;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  zone: 'top' | 'playoff' | 'bad';
  zoneLabel: string;
}

export interface CupGroup {
  id: string; // 'A', 'B', 'C', 'D'
  name: string;
  teams: string[];
  table: CupGroupTeamRow[];
}

export interface CupState2026 {
  season: string;
  stage: 'groups_and_qual' | 'playoff_spring' | 'final';
  finalDate: string; // '2027-06-06'
  rplGroups: Record<string, CupGroup>; // A, B, C, D
  regionsQualRounds: {
    round: number;
    title: string;
    completed: boolean;
  }[];
  playoff: {
    rplBracket: {
      r16: any[]; // 1/8 финала (двухматчевые)
      qf: any[];  // 1/4 финала (двухматчевые)
      sf: any[];  // 1/2 финала (двухматчевые)
    };
    regionsBracket: {
      r16: any[];
      qf: any[];
      sf: any[];
      final: any[]; // финал пути регионов
    };
    superFinal: any | null; // Финал 6 июня 2027
  };
}

/**
 * Инициализация структуры Кубка России на новый сезон
 */
export function initCup2026(
  season: string,
  rplTeams: any[],
  fnlTeams: any[],
  secondLeagueTeams: any[],
  mediaTeams: any[],
  uidFn: () => string
): { cupState: CupState2026; fixtures: any[] } {
  const fixtures: any[] = [];

  // 1. Формируем 4 группы Пути РПЛ (по 4 команды)
  const shuffledRpl = [...rplTeams].sort(() => Math.random() - 0.5);
  const groupIds = ['A', 'B', 'C', 'D'];
  const rplGroups: Record<string, CupGroup> = {};

  groupIds.forEach((gid, gi) => {
    const gTeams = shuffledRpl.slice(gi * 4, (gi + 1) * 4).map(t => t.id);
    rplGroups[gid] = {
      id: gid,
      name: `Группа ${gid}`,
      teams: gTeams,
      table: gTeams.map((tid, idx) => {
        const teamObj = rplTeams.find(t => t.id === tid);
        return {
          id: tid,
          name: teamObj?.name || tid,
          pos: idx + 1,
          p: 0,
          w: 0,
          d: 0,
          l: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          pts: 0,
          zone: idx < 2 ? 'top' : (idx === 2 ? 'playoff' : 'bad'),
          zoneLabel: idx < 2 ? '1/8 Пути РПЛ' : (idx === 2 ? 'В Путь регионов' : 'Вылет')
        };
      })
    };

    // Создаем расписание для 4 команд: 6 туров двухкругового турнира
    // Туры 1-3 (первый круг), туры 4-6 (второй круг со сменой полей)
    const t = gTeams;
    const groupRounds = [
      [[t[0], t[1]], [t[2], t[3]]], // 1 тур
      [[t[0], t[2]], [t[3], t[1]]], // 2 тур
      [[t[3], t[0]], [t[1], t[2]]], // 3 тур
      [[t[1], t[0]], [t[3], t[2]]], // 4 тур (обратные)
      [[t[2], t[0]], [t[1], t[3]]], // 5 тур
      [[t[0], t[3]], [t[2], t[1]]]  // 6 тур
    ];

    const groupDates = [
      '2026-08-12', '2026-08-26', '2026-09-16',
      '2026-09-30', '2026-10-21', '2026-11-04'
    ];

    groupRounds.forEach((pairs, roundIdx) => {
      pairs.forEach(([homeId, awayId], matchIdx) => {
        fixtures.push({
          id: uidFn(),
          season,
          comp: 'cup',
          cupPath: 'rpl_group',
          groupId: gid,
          round: roundIdx + 1,
          label: `Путь РПЛ · Группа ${gid} · ${roundIdx + 1}-й тур`,
          date: groupDates[roundIdx],
          time: matchIdx % 2 === 0 ? '17:30' : '20:00',
          home: homeId,
          away: awayId,
          status: 'scheduled',
          hg: null,
          ag: null,
          pos: 0
        });
      });
    });
  });

  // 2. Формируем Путь регионов (отборочные раунды на выбывание)
  // Раунд 1: Команды Медиалиги и Второй лиги «Б»
  const earlyTeams = [...mediaTeams, ...secondLeagueTeams].sort(() => Math.random() - 0.5);
  const r1Count = Math.min(32, Math.floor(earlyTeams.length / 2) * 2);
  const r1Picks = earlyTeams.slice(0, r1Count);

  for (let i = 0; i < r1Picks.length; i += 2) {
    fixtures.push({
      id: uidFn(),
      season,
      comp: 'cup',
      cupPath: 'regions_qual',
      qualRound: 1,
      round: 101,
      label: 'Путь регионов · 1-й отборочный раунд',
      date: '2026-08-05',
      time: i % 4 === 0 ? '16:00' : '18:30',
      home: r1Picks[i].id,
      away: r1Picks[i + 1].id,
      status: 'scheduled',
      hg: null,
      ag: null,
      pos: 0
    });
  }

  // Раунд 2 (август 2026) и Раунд 3 (сентябрь 2026) с добавлением клубов 2-й лиги «А»
  // Раунд 4 (конец сентября/октябрь): вступают 18 клубов Первой лиги!
  const fnlShuffled = [...fnlTeams].sort(() => Math.random() - 0.5);
  for (let i = 0; i + 1 < fnlShuffled.length; i += 2) {
    fixtures.push({
      id: uidFn(),
      season,
      comp: 'cup',
      cupPath: 'regions_qual',
      qualRound: 4,
      round: 104,
      label: 'Путь регионов · 4-й раунд (старт Первой лиги)',
      date: '2026-09-23',
      time: i % 4 === 0 ? '16:00' : '19:00',
      home: fnlShuffled[i].id,
      away: fnlShuffled[i + 1].id,
      status: 'scheduled',
      hg: null,
      ag: null,
      pos: 0
    });
  }

  const cupState: CupState2026 = {
    season,
    stage: 'groups_and_qual',
    finalDate: '2027-06-06',
    rplGroups,
    regionsQualRounds: [
      { round: 1, title: '1-й раунд (Медиалига и 2-я лига)', completed: false },
      { round: 2, title: '2-й раунд (Отбор 2-й лиги)', completed: false },
      { round: 3, title: '3-й раунд (Выход на Первую лигу)', completed: false },
      { round: 4, title: '4-й раунд (Вступают 18 клубов Первой лиги)', completed: false },
      { round: 5, title: '5-й раунд Пути регионов', completed: false },
      { round: 6, title: '6-й раунд Пути регионов (Выход в весенний плей-офф)', completed: false }
    ],
    playoff: {
      rplBracket: { r16: [], qf: [], sf: [] },
      regionsBracket: { r16: [], qf: [], sf: [], final: [] },
      superFinal: null
    }
  };

  return { cupState, fixtures };
}

/**
 * Пересчет турнирных таблиц групп Пути РПЛ
 */
export function recalculateCupGroups(cupState: CupState2026, fixtures: any[]): void {
  if (!cupState || !cupState.rplGroups) return;

  const cupFx = fixtures.filter(f => f.comp === 'cup' && f.cupPath === 'rpl_group' && f.status === 'done');

  for (const gid of ['A', 'B', 'C', 'D']) {
    const grp = cupState.rplGroups[gid];
    if (!grp) continue;

    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }> = {};
    for (const tid of grp.teams) {
      stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    }

    const gMatches = cupFx.filter(f => f.groupId === gid);
    for (const f of gMatches) {
      const h = stats[f.home], a = stats[f.away];
      if (!h || !a) continue;

      h.p += 1; a.p += 1;
      h.gf += f.hg; h.ga += f.ag;
      a.gf += f.ag; a.ga += f.hg;
      h.gd = h.gf - h.ga;
      a.gd = a.gf - a.ga;

      if (f.hg > f.ag) {
        h.w += 1; h.pts += 3;
        a.l += 1;
      } else if (f.ag > f.hg) {
        a.w += 1; a.pts += 3;
        h.l += 1;
      } else {
        // В Кубке России при ничьей в основное время пробивается серия пенальти!
        // Победитель по пенальти получает 2 очка, проигравший — 1 очко
        h.d += 1; a.d += 1;
        if (f.pen) {
          if (f.pen.winner === 'home' || f.pen.hg > f.pen.ag) {
            h.pts += 2;
            a.pts += 1;
          } else {
            a.pts += 2;
            h.pts += 1;
          }
        } else {
          h.pts += 1;
          a.pts += 1;
        }
      }
    }

    const sorted = grp.teams.map(tid => {
      const s = stats[tid] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      const teamRow = grp.table.find(r => r.id === tid);
      return {
        id: tid,
        name: teamRow?.name || tid,
        pos: 1,
        ...s,
        zone: 'top' as const,
        zoneLabel: ''
      };
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    sorted.forEach((r, idx) => {
      r.pos = idx + 1;
      if (idx < 2) {
        r.zone = 'top';
        r.zoneLabel = '1/8 Пути РПЛ';
      } else if (idx === 2) {
        r.zone = 'playoff';
        r.zoneLabel = 'В Путь регионов';
      } else {
        r.zone = 'bad';
        r.zoneLabel = 'Вылет';
      }
    });

    grp.table = sorted;
  }
}
