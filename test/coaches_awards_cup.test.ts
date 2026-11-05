import test from 'node:test';
import assert from 'node:assert';
import { getTeamCoach, computeCoachSynergy, Coach } from '../src/coaches.ts';
import { computeMatchRatings, getMatchMotm, buildTeamOfRound } from '../src/awards.ts';
import { initCup2026, recalculateCupGroups } from '../src/cup2026.ts';

test('Coaches: retrieves authentic RPL head coaches with designated tactical philosophies', () => {
  const zenitCoach = getTeamCoach('Зенит', 'rpl');
  assert.strictEqual(zenitCoach.name, 'Сергей Семак');
  assert.strictEqual(zenitCoach.style, 'possession');

  const spartakCoach = getTeamCoach('Спартак', 'rpl');
  assert.strictEqual(spartakCoach.name, 'Деян Станкович');
  assert.strictEqual(spartakCoach.style, 'attack');

  const rubinCoach = getTeamCoach('Рубин', 'rpl');
  assert.strictEqual(rubinCoach.name, 'Рашид Рахимов');
  assert.strictEqual(rubinCoach.style, 'bus');

  const lokomotivCoach = getTeamCoach('Локомотив', 'rpl');
  assert.strictEqual(lokomotivCoach.name, 'Михаил Галактионов');
  assert.strictEqual(lokomotivCoach.style, 'press');

  const cskaCoach = getTeamCoach('ЦСКА', 'rpl');
  assert.strictEqual(cskaCoach.name, 'Марко Николич');
  assert.strictEqual(cskaCoach.style, 'counter');
});

test('Coaches: tactical synergy accurately penalizes mismatched playstyles (bus coach with attacking squad)', () => {
  const busCoach: Coach = {
    id: 'test_bus',
    name: 'Иван Оборонный',
    clubName: 'Тест',
    nationality: 'Россия',
    age: 55,
    style: 'bus',
    styleTitle: 'Автобус',
    styleDesc: 'Низкий блок',
    favoriteFormation: '5-3-2',
    reputation: 80,
    temperament: 'Строгий',
    quote: 'Защита'
  };

  // 1. Полная гармония: автобусник + установка на автобус и схема 5-3-2
  const goodTactics = {
    formation: '5-3-2',
    speech: 'Ставим бетон, глухая оборона на ноль',
    training: 'Отработка обороны и стандартов'
  };
  const synGood = computeCoachSynergy(busCoach, goodTactics);
  assert.ok(synGood.score >= 80, `Expected high synergy, got ${synGood.score}`);
  assert.ok(synGood.status === 'excellent' || synGood.status === 'good');
  assert.ok(synGood.xgaMultiplier <= 0.95);

  // 2. Тактический диссонанс: автобусник + установка "все в атаку, штурм" и схема 4-3-3
  const clashTactics = {
    formation: '4-3-3',
    speech: 'Все в атаку! Бежим вперед, тотальный штурм и забивать!',
    training: 'Отработка дальних ударов и атак'
  };
  const synClash = computeCoachSynergy(busCoach, clashTactics);
  assert.ok(synClash.score < 50, `Expected low synergy score, got ${synClash.score}`);
  assert.ok(synClash.status === 'poor' || synClash.status === 'clash');
  assert.ok(synClash.xgMultiplier < 1.0);
  assert.ok(synClash.xgaMultiplier > 1.1);
});

test('Awards: computes MOTM and post-match interview for match winners and key performers', () => {
  const fixture = {
    id: 'fx_1',
    comp: 'rpl',
    date: '2026-08-15',
    time: '19:00',
    hg: 2,
    ag: 1,
    status: 'done'
  };

  const match = {
    events: [],
    ctx: {
      pos: { p1: 'НАП', p2: 'ПЗ', p3: 'ВР' }
    },
    stats: {
      players: {
        p1: { n: 'Артём Дзюба', t: 'akron', side: 'home', min: 90, g: 2, a: 0, xg: 1.4, sh: 4 },
        p2: { n: 'Эдуард Сперцян', t: 'krasnodar', side: 'away', min: 90, g: 1, a: 0, xg: 0.6, sh: 2 },
        p3: { n: 'Сергей Волков', t: 'akron', side: 'home', min: 90, sv: 4, cs: 0 }
      }
    }
  };

  const motm = getMatchMotm(match, fixture, 'Акрон', 'Краснодар');
  assert.ok(motm);
  assert.strictEqual(motm.name, 'Артём Дзюба');
  assert.ok(motm.rating >= 8.0);
  assert.ok(motm.interview.quote.length > 20);
  assert.ok(motm.interview.headline.includes('Дзюба'));
});

test('Russian Cup 2026/2027: generates 4 RPL groups of 4 teams, 6 rounds, and Regions Path qualifiers', () => {
  const rplTeams = Array.from({ length: 16 }, (_, i) => ({ id: `rpl_${i + 1}`, name: `Клуб РПЛ ${i + 1}` }));
  const fnlTeams = Array.from({ length: 18 }, (_, i) => ({ id: `fnl_${i + 1}`, name: `Клуб ФНЛ ${i + 1}` }));
  const secondLeagueTeams = Array.from({ length: 20 }, (_, i) => ({ id: `2l_${i + 1}`, name: `Клуб 2Л ${i + 1}` }));
  const mediaTeams = Array.from({ length: 8 }, (_, i) => ({ id: `med_${i + 1}`, name: `Медиаклуб ${i + 1}` }));

  let uidCounter = 0;
  const uid = () => `cup_${++uidCounter}`;

  const { cupState, fixtures } = initCup2026('2026/27', rplTeams, fnlTeams, secondLeagueTeams, mediaTeams, uid);

  // Проверяем Путь РПЛ: 4 группы A, B, C, D
  assert.deepStrictEqual(Object.keys(cupState.rplGroups), ['A', 'B', 'C', 'D']);
  for (const gid of ['A', 'B', 'C', 'D']) {
    assert.strictEqual(cupState.rplGroups[gid].teams.length, 4);
    assert.strictEqual(cupState.rplGroups[gid].table.length, 4);
  }

  // В каждой группе 6 туров по 2 матча = 12 матчей на группу * 4 = 48 матчей
  const rplGroupFx = fixtures.filter(f => f.cupPath === 'rpl_group');
  assert.strictEqual(rplGroupFx.length, 48);

  // Путь регионов: отборочные раунды
  const regQualFx = fixtures.filter(f => f.cupPath === 'regions_qual');
  assert.ok(regQualFx.length >= 16);

  // Проверяем пересчет очков с сериями пенальти
  const testMatch = rplGroupFx[0];
  testMatch.status = 'done';
  testMatch.hg = 1;
  testMatch.ag = 1;
  testMatch.pen = { winner: 'home', hg: 5, ag: 4 };

  recalculateCupGroups(cupState, fixtures);
  const grp = cupState.rplGroups[testMatch.groupId];
  const homeRow = grp.table.find(r => r.id === testMatch.home);
  const awayRow = grp.table.find(r => r.id === testMatch.away);

  assert.strictEqual(homeRow?.pts, 2, 'Winner on penalty shootout gets 2 points');
  assert.strictEqual(awayRow?.pts, 1, 'Loser on penalty shootout gets 1 point');
});
