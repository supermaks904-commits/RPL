/**
 * Тренерский штаб, стили и тактическая синергия клубов
 * Реализует влияние философии тренера на игру команды:
 * - bus: «Автобус / Низкий блок» (упор на дисциплину, отборы, сухие матчи)
 * - counter: «Быстрые кинжальные контратаки» (компактность, взрывные выпады)
 * - possession: «Контроль мяча / Доминирование» (короткий пас, комбинации)
 * - attack: «Тотальная атака / Атакующий футбол» (высокий темп, фланги, много ударов и xG)
 * - press: «Высокий интенсивный прессинг» (Gegenpressing, отборы на чужой половине)
 */

export type CoachStyle = 'bus' | 'counter' | 'possession' | 'attack' | 'press';

export interface Coach {
  id: string;
  name: string;
  clubName: string;
  nationality: string;
  age: number;
  style: CoachStyle;
  styleTitle: string;
  styleDesc: string;
  favoriteFormation: string;
  reputation: number; // 50-99
  temperament: string;
  quote: string;
}

export interface CoachSynergy {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'neutral' | 'poor' | 'clash';
  statusTitle: string;
  statusBadgeClass: string;
  xgMultiplier: number;
  xgaMultiplier: number;
  defenseBonus: number;
  tackleBonus: number;
  foulModifier: number;
  description: string;
}

export const COACH_STYLES_INFO: Record<CoachStyle, { title: string; desc: string; favoredFormations: string[] }> = {
  bus: {
    title: '«Автобус» (Глухая оборона и низкий блок)',
    desc: 'Предельная дисциплина у своей штрафной, ставка на сухие матчи, стандарты и минимизацию ошибок.',
    favoredFormations: ['5-3-2', '5-4-1', '4-5-1', '4-4-2']
  },
  counter: {
    title: 'Быстрые контратаки',
    desc: 'Компактная средняя линия, перехваты мяча и мгновенные кинжальные выпады через скоростных вингеров.',
    favoredFormations: ['4-3-3', '3-5-2', '4-2-3-1', '4-4-2']
  },
  possession: {
    title: 'Контроль мяча и позиционная игра',
    desc: 'Доминирование во владении, методичное расшатывание обороны коротким пасом и треугольниками.',
    favoredFormations: ['4-3-3', '4-2-3-1', '3-4-3', '4-1-4-1']
  },
  attack: {
    title: 'Тотальный атакующий футбол',
    desc: 'Высочайший темп, подключение крайних защитников, масса ударов по воротам и высокий xG.',
    favoredFormations: ['4-3-3', '3-4-3', '4-2-4', '4-2-3-1']
  },
  press: {
    title: 'Высокий интенсивный прессинг',
    desc: 'Агрессивный отбор на чужой трети поля, постоянное давление и физическое подавление соперника.',
    favoredFormations: ['4-3-3', '4-2-3-1', '3-5-2', '4-4-2']
  }
};

/**
 * База главных тренеров клубов России
 */
export const DEFAULT_COACHES: Record<string, Coach> = {
  // РПЛ
  'зенит': {
    id: 'semak',
    name: 'Сергей Семак',
    clubName: 'Зенит',
    nationality: 'Россия',
    age: 50,
    style: 'possession',
    styleTitle: 'Контроль мяча и доминирование',
    styleDesc: 'Сбалансированный позиционный футбол с контролем темпа и индивидуальным классом лидеров.',
    favoriteFormation: '4-3-3',
    reputation: 92,
    temperament: 'Спокойный, рассудительный прагматик',
    quote: '«Главное — баланс между атакой и обороной, в каждом матче нужно играть с позиции силы».'
  },
  'краснодар': {
    id: 'musaev',
    name: 'Мурад Мусаев',
    clubName: 'Краснодар',
    nationality: 'Россия',
    age: 43,
    style: 'attack',
    styleTitle: 'Доминирующая эстетичная атака',
    styleDesc: 'Красивый комбинационный футбол Галицкого — быстрый выход из обороны, умный пас и давление.',
    favoriteFormation: '4-3-3',
    reputation: 86,
    temperament: 'Эмоциональный, нацеленный на атаку романтик',
    quote: '«Мы играем для зрителей — футбол должен быть ярким, смелым и результативным».'
  },
  'локомотив': {
    id: 'galaktionov',
    name: 'Михаил Галактионов',
    clubName: 'Локомотив',
    nationality: 'Россия',
    age: 42,
    style: 'press',
    styleTitle: 'Молодёжный скоростной прессинг',
    styleDesc: 'Высокая интенсивность, доверие молодым российским талантам, динамика и вертикализация.',
    favoriteFormation: '4-2-3-1',
    reputation: 85,
    temperament: 'Энергичный методист-мотиватор',
    quote: '«Дисциплина, движение и самоотдача — молодые парни должны бежать вперёд все 90 минут».'
  },
  'спартак': {
    id: 'stankovic',
    name: 'Деян Станкович',
    clubName: 'Спартак',
    nationality: 'Сербия',
    age: 48,
    style: 'attack',
    styleTitle: 'Страстная эмоциональная атака',
    styleDesc: 'Агрессивный, напористый футбол с высоким индивидуальным прессингом и заряженностью на борьбу.',
    favoriteFormation: '4-3-3',
    reputation: 88,
    temperament: 'Бурный лидер с менталитетом победителя',
    quote: '«В "Спартаке" нужно отдавать сердце на поле. Ни шагу назад, только победа!».'
  },
  'цска': {
    id: 'nikolic',
    name: 'Марко Николич',
    clubName: 'ЦСКА',
    nationality: 'Сербия',
    age: 47,
    style: 'counter',
    styleTitle: 'Организованный прагматичный контр-атакующий стиль',
    styleDesc: 'Плотные линии обороны, отточенные стандарты и мгновенный переход из обороны в атаку.',
    favoriteFormation: '3-5-2',
    reputation: 87,
    temperament: 'Холоднокровный тактический аналитик',
    quote: '«Трофеи выигрывает оборона и железная дисциплина на каждом участке газона».'
  },
  'динамо': {
    id: 'lichka',
    name: 'Марцел Личка',
    clubName: 'Динамо',
    nationality: 'Чехия',
    age: 49,
    style: 'attack',
    styleTitle: 'Открытый бесшабашный тотальный футбол',
    styleDesc: 'Атака без оглядки на свои ворота, высокий темп, изобилие голевых моментов и риск.',
    favoriteFormation: '4-3-3',
    reputation: 85,
    temperament: 'Искренний, смелый и открытый душевный тренер',
    quote: '«Лучше победить 4:3, чем тоскливо сыграть 0:0. Футбол существует ради забитых мячей!».'
  },
  'ростов': {
    id: 'karpin',
    name: 'Валерий Карпин',
    clubName: 'Ростов',
    nationality: 'Россия',
    age: 57,
    style: 'press',
    styleTitle: 'Агрессивный прессинг и выход через короткий пас',
    styleDesc: 'Розыгрыш от своих ворот любой ценой, удушающий прессинг на половине соперника.',
    favoriteFormation: '4-3-3',
    reputation: 89,
    temperament: 'Харизматичный, резкий и бескомпромиссный',
    quote: '«Играйте в футбол, а не бейте мяч куда попало! Ошибся — исправь и продолжай играть».'
  },
  'рубин': {
    id: 'rakhimov',
    name: 'Рашид Рахимов',
    clubName: 'Рубин',
    nationality: 'Россия',
    age: 61,
    style: 'bus',
    styleTitle: 'Казанский оборонительный бастион',
    styleDesc: 'Эшелонированная оборона, плотная опека, силовая борьба и максимальная реализация стандартов.',
    favoriteFormation: '5-3-2',
    reputation: 83,
    temperament: 'Строгий тактический диктатор',
    quote: '«Сначала закроем свои ворота на замок, а впереди свой шанс мы обязательно найдём».'
  },
  'ахмат': {
    id: 'tashuev',
    name: 'Сергей Ташуев',
    clubName: 'Ахмат',
    nationality: 'Россия',
    age: 67,
    style: 'press',
    styleTitle: 'Вертикальный интенсивный силовой прессинг',
    styleDesc: 'Жесткие единоборства, вертикальные передачи в свободные зоны и мощное давление.',
    favoriteFormation: '4-2-3-1',
    reputation: 81,
    temperament: 'Опытный тренер старой закалки',
    quote: '«Нам нужна максимальная плотность и единоборства. Футбол не прощает мягкости».'
  },
  'крылья советов': {
    id: 'osinkin',
    name: 'Игорь Осинькин',
    clubName: 'Крылья Советов',
    nationality: 'Россия',
    age: 60,
    style: 'possession',
    styleTitle: 'Умный позиционный комбинационный футбол',
    styleDesc: 'Тонкая игра в пас, развитие молодых талантов, умные перемещения между линиями.',
    favoriteFormation: '4-2-3-1',
    reputation: 84,
    temperament: 'Мудрый футбольный учитель и тактик',
    quote: '«Мяч двигается быстрее любого игрока. Научитесь мыслить на шаг быстрее соперника».'
  },
  'балтика': {
    id: 'talalaev',
    name: 'Андрей Талалаев',
    clubName: 'Балтика',
    nationality: 'Россия',
    age: 53,
    style: 'press',
    styleTitle: 'Тотальный прессинг и бешеная самоотдача',
    styleDesc: 'Физическая мощь, агрессивный отбор мяча, высокая линия обороны и стремительные фланги.',
    favoriteFormation: '4-3-3',
    reputation: 84,
    temperament: 'Взрывной мотиватор с железными требованиями',
    quote: '«Если соперник владеет мячом больше трёх секунд — мы недоработали. Прессинг до свистка!».'
  },
  'оренбург': {
    id: 'deogracia',
    name: 'Давид Деограсия',
    clubName: 'Оренбург',
    nationality: 'Испания',
    age: 52,
    style: 'possession',
    styleTitle: 'Испанский позиционный комбинационный стиль',
    styleDesc: 'Техничный футбол, короткие стенки, подключение инсайдов и розыгрыш лишнего игрока.',
    favoriteFormation: '4-3-3',
    reputation: 79,
    temperament: 'Тактичный европейский методист',
    quote: '«Владея мячом, мы контролируем ход игры и снижаем опасность у своих ворот».'
  },
  'акрон': {
    id: 'tedeev',
    name: 'Заур Тедеев',
    clubName: 'Акрон',
    nationality: 'Россия',
    age: 44,
    style: 'attack',
    styleTitle: 'Дерзкий атакующий футбол без авторитетов',
    styleDesc: 'Смелая игра первым номером, ставка на креативных форвардов (Дзюба) и фланговые подачи.',
    favoriteFormation: '4-3-3',
    reputation: 80,
    temperament: 'Смелый, амбициозный новатор',
    quote: '«Неважно, кто против нас — мы приехали играть в футбол и забивать голы».'
  },
  'динамо махачкала': {
    id: 'bidzhiev',
    name: 'Хасанби Биджиев',
    clubName: 'Динамо Махачкала',
    nationality: 'Россия',
    age: 59,
    style: 'bus',
    styleTitle: 'Дагестанский монолитный железобетон',
    styleDesc: 'Непроходимый низкий блок, самоотверженные подкаты, жесткий отбор и минимум пропущенных мячей.',
    favoriteFormation: '5-3-2',
    reputation: 81,
    temperament: 'Невозмутимый кавказский стратег',
    quote: '«Сломать наш характер невозможно. Каждый метр поля будет стоить сопернику крови».'
  },
  'факел': {
    id: 'pyatibratov',
    name: 'Дмитрий Пятибратов',
    clubName: 'Факел',
    nationality: 'Россия',
    age: 49,
    style: 'bus',
    styleTitle: 'Огненный воронежский бойцовский футбол',
    styleDesc: 'Силовая борьба, выгрызание мяча, верховые дуэли и бешеная энергетика воронежских трибун.',
    favoriteFormation: '5-3-2',
    reputation: 80,
    temperament: 'Страстный народный боец',
    quote: '«В Воронеже никому не будет легко. Мы выходим сражаться за наш город и болельщиков».'
  },
  'родина': {
    id: 'sokolinskiy',
    name: 'Филипп Соколинский',
    clubName: 'Родина',
    nationality: 'Россия',
    age: 39,
    style: 'possession',
    styleTitle: 'Современный комбинационный позиционный футбол',
    styleDesc: 'Техничные полузащитники, поиск свободных зон, быстрый пас низом и компактность.',
    favoriteFormation: '4-3-3',
    reputation: 77,
    temperament: 'Молодой прогрессивный тактик',
    quote: '«Умное движение без мяча создает пространство для голевого удара».'
  },

  // Первая лига и Вторая лига (ключевые наставники)
  'арсенал': {
    id: 'storozhuk',
    name: 'Александр Сторожук',
    clubName: 'Арсенал Тула',
    nationality: 'Россия',
    age: 44,
    style: 'counter',
    styleTitle: 'Быстрые тульские контратаки',
    styleDesc: 'Организованная оборона и быстрый разгон атак через фланги.',
    favoriteFormation: '4-2-3-1',
    reputation: 79,
    temperament: 'Спокойный требовательный специалист',
    quote: '«Каждая ошибка соперника должна превращаться в голевой момент».'
  },
  'торпедо': {
    id: 'kononov',
    name: 'Олег Кононов',
    clubName: 'Торпедо Москва',
    nationality: 'Беларусь',
    age: 59,
    style: 'possession',
    styleTitle: 'Романтический комбинационный спартаковский пас',
    styleDesc: 'Стеночки, забегания, контроль мяча в финальной трети поля.',
    favoriteFormation: '4-3-3',
    reputation: 81,
    temperament: 'Интеллигентный романтик футбола',
    quote: '«Футбол должен приносить эстетическое удовольствие».'
  },
  'урал': {
    id: 'averianov',
    name: 'Евгений Аверьянов',
    clubName: 'Урал',
    nationality: 'Россия',
    age: 47,
    style: 'press',
    styleTitle: 'Уральский силовой характер и прессинг',
    styleDesc: 'Плотный прессинг, фланговые подачи, силовое давление в штрафной.',
    favoriteFormation: '4-2-3-1',
    reputation: 77,
    temperament: 'Уральский боец и воспитанник клуба',
    quote: '«Урал всегда славился характером, мы вернемся в Премьер-Лигу».'
  },
  'сочи': {
    id: 'moreno',
    name: 'Роберт Морено',
    clubName: 'Сочи',
    nationality: 'Испания',
    age: 48,
    style: 'possession',
    styleTitle: 'Испанская тики-така и позиционное доминирование',
    styleDesc: 'Тотальный контроль мяча, геометрия паса, экс-наставник сборной Испании.',
    favoriteFormation: '4-3-3',
    reputation: 85,
    temperament: 'Педантичный европейский профессор тактики',
    quote: '«Без владения мячом невозможно контролировать результат».'
  },
  'пари нн': {
    id: 'goncharenko',
    name: 'Виктор Гончаренко',
    clubName: 'Пари НН',
    nationality: 'Беларусь',
    age: 49,
    style: 'counter',
    styleTitle: 'Тактическая гибкость и резкие контратаки',
    styleDesc: 'Адаптация под соперника, дисциплинированный блок и кинжальные контрвыпады.',
    favoriteFormation: '3-5-2',
    reputation: 84,
    temperament: 'Эмоциональный тактический мастер',
    quote: '«Нужно уметь терпеть и наказывать соперника за малейшую расслабленность».'
  },
  'ротор': {
    id: 'boyarintsev',
    name: 'Денис Бояринцев',
    clubName: 'Ротор',
    nationality: 'Россия',
    age: 47,
    style: 'counter',
    styleTitle: 'Волгоградский бойцовский дух и быстрый фланг',
    styleDesc: 'Бескомпромиссная борьба, ярость на флангах, голы на последних минутах.',
    favoriteFormation: '4-4-2',
    reputation: 77,
    temperament: 'Легендарный спартаковский боец-заводила',
    quote: '«Играть до последней секунды компенсированного времени!».'
  },
  'амкар': {
    id: 'bobrov',
    name: 'Андрей Бобров',
    clubName: 'Амкар Пермь',
    nationality: 'Россия',
    age: 46,
    style: 'bus',
    styleTitle: 'Пермский неуступчивый блок',
    styleDesc: 'Фирменная пермская жесткость, строгая оборона и реализация стандартов.',
    favoriteFormation: '5-3-2',
    reputation: 75,
    temperament: 'Уральский суровый наставник',
    quote: '«Амкар никогда не сдавался без боя на домашнем поле».'
  },

  // Медиалига
  '2drots': {
    id: 'kuznetsov',
    name: 'Дмитрий Кузнецов',
    clubName: '2DROTS',
    nationality: 'Россия',
    age: 60,
    style: 'press',
    styleTitle: 'Профессиональный чемпионский прессинг «самураев»',
    styleDesc: 'Легенда ЦСКА и Эспаньола, ставит дисциплину профи-уровня с мощнейшим прессингом.',
    favoriteFormation: '4-3-3',
    reputation: 87,
    temperament: 'Харизматичный строгий мэтр медиафутбола',
    quote: '«В медиафутболе побеждает тот, кто пашет как профессионал».'
  },
  'амкал': {
    id: 'panov',
    name: 'Виталий Панов',
    clubName: 'Амкал',
    nationality: 'Россия',
    age: 46,
    style: 'attack',
    styleTitle: 'Быстрый комбинационный медийный штурм',
    styleDesc: 'Яркая открытая игра, прессинг, смелые подключения крайних защитников.',
    favoriteFormation: '4-3-3',
    reputation: 83,
    temperament: 'Современный энергичный тактик',
    quote: '«"Амкал" обязан играть в атаку и радовать миллионы болельщиков».'
  },
  'броук бойз': {
    id: 'soslan',
    name: 'Сослан Гатагов',
    clubName: 'Broke Boys',
    nationality: 'Россия',
    age: 33,
    style: 'possession',
    styleTitle: 'Техничный позиционный футбол броуков',
    styleDesc: 'Умный контроль мяча, техника ветеранов РПЛ и нестандартные решения.',
    favoriteFormation: '4-3-3',
    reputation: 81,
    temperament: 'Креативный медийный лидер',
    quote: '«Броуки играют красиво и доказывают класс на поле».'
  },
  'чисто питер': {
    id: 'radimov',
    name: 'Владислав Радимов',
    clubName: 'Чисто Питер',
    nationality: 'Россия',
    age: 50,
    style: 'possession',
    styleTitle: 'Петербургский умный футбол в пас',
    styleDesc: 'Интеллектуальная игра в центре поля, зенитовский дух и контроль.',
    favoriteFormation: '4-3-3',
    reputation: 84,
    temperament: 'Острый на язык легендарный капитан',
    quote: '«В футбол играют головой, а ноги только помогают».'
  }
};

/**
 * Получить тренера для команды по имени или сгенерировать подходящего
 */
export function getTeamCoach(teamName: string, compId: string = 'rpl'): Coach {
  const normName = (teamName || '').toLowerCase().trim();

  for (const [k, c] of Object.entries(DEFAULT_COACHES)) {
    if (normName.includes(k) || k.includes(normName)) {
      return { ...c, clubName: teamName };
    }
  }

  // Генератор для остальных клубов в зависимости от дивизиона
  const styles: CoachStyle[] = compId === 'rpl'
    ? ['possession', 'attack', 'press', 'counter']
    : (compId === 'media' ? ['attack', 'press', 'counter'] : ['bus', 'counter', 'press']);

  const hash = normName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pickedStyle = styles[hash % styles.length];
  const info = COACH_STYLES_INFO[pickedStyle];

  const firstNames = ['Александр', 'Сергей', 'Дмитрий', 'Андрей', 'Владимир', 'Игорь', 'Олег', 'Михаил', 'Евгений', 'Валерий'];
  const lastNames = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Морозов', 'Новиков', 'Фёдоров'];
  const fn = firstNames[hash % firstNames.length];
  const ln = lastNames[(hash * 7) % lastNames.length];

  return {
    id: `coach_${hash}`,
    name: `${fn} ${ln}`,
    clubName: teamName,
    nationality: 'Россия',
    age: 40 + (hash % 25),
    style: pickedStyle,
    styleTitle: info.title,
    styleDesc: info.desc,
    favoriteFormation: info.favoredFormations[0] || '4-3-3',
    reputation: compId === 'rpl' ? 75 + (hash % 15) : 65 + (hash % 18),
    temperament: 'Дисциплинированный наставник',
    quote: '«Только командная работа и выполнение установки принесут результат».'
  };
}

/**
 * Рассчитать тактическую синергию между тренером и тактикой команды
 */
export function computeCoachSynergy(coach: Coach, tactics: any): CoachSynergy {
  const coachStyle = coach.style;
  const teamFormation = (tactics?.formation || '4-3-3').trim();
  const teamSpeech = (tactics?.speech || '').toLowerCase();
  const teamTraining = (tactics?.training || '').toLowerCase();

  // Определяем вектор установки команды
  let teamOrientation: 'bus' | 'counter' | 'possession' | 'attack' | 'press' | 'balanced' = 'balanced';

  if (teamSpeech.includes('автобус') || teamSpeech.includes('глухая оборона') || teamSpeech.includes('бетон') || teamSpeech.includes('на ноль') || teamTraining.includes('оборон')) {
    teamOrientation = 'bus';
  } else if (teamSpeech.includes('контратак') || teamSpeech.includes('вторым номером') || teamSpeech.includes('ловить на ошибк') || teamTraining.includes('контратак')) {
    teamOrientation = 'counter';
  } else if (teamSpeech.includes('прессинг') || teamSpeech.includes('душить') || teamSpeech.includes('давить') || teamSpeech.includes('высоко встречать') || teamTraining.includes('прессинг')) {
    teamOrientation = 'press';
  } else if (teamSpeech.includes('владение') || teamSpeech.includes('контрол') || teamSpeech.includes('пас') || teamSpeech.includes('не спешить') || teamTraining.includes('пас')) {
    teamOrientation = 'possession';
  } else if (teamSpeech.includes('атака') || teamSpeech.includes('вперёд') || teamSpeech.includes('штурм') || teamSpeech.includes('забивать') || teamTraining.includes('удар') || teamTraining.includes('атак')) {
    teamOrientation = 'attack';
  } else {
    // По схеме
    if (teamFormation.startsWith('5-') || teamFormation === '4-5-1') teamOrientation = 'bus';
    else if (teamFormation === '3-5-2' || teamFormation === '4-4-2') teamOrientation = 'counter';
    else if (teamFormation === '4-3-3' || teamFormation === '3-4-3') teamOrientation = 'attack';
    else teamOrientation = 'balanced';
  }

  // Расчет баллов совместимости
  let score = 70; // базовый нейтральный уровень
  let desc = '';

  // Сравнение философии тренера и ориентации команды
  if (coachStyle === teamOrientation) {
    score += 25;
    desc = `Полная гармония: тренер и состав мыслят одинаково в стиле «${coach.styleTitle}». Игроки безупречно понимают установку.`;
  } else if (
    (coachStyle === 'attack' && teamOrientation === 'possession') ||
    (coachStyle === 'possession' && teamOrientation === 'attack') ||
    (coachStyle === 'counter' && teamOrientation === 'press') ||
    (coachStyle === 'press' && teamOrientation === 'attack') ||
    (coachStyle === 'bus' && teamOrientation === 'counter')
  ) {
    score += 15;
    desc = `Хорошая тактическая сочетаемость: принципы тренера дополняют текущую игровую модель клуба.`;
  } else if (teamOrientation === 'balanced') {
    score += 5;
    desc = `Сбалансированная модель: команда выполняет базовые требования наставника без перекосов.`;
  } else if (
    (coachStyle === 'bus' && (teamOrientation === 'attack' || teamOrientation === 'press')) ||
    (coachStyle === 'attack' && teamOrientation === 'bus')
  ) {
    // Прямой тактический конфликт (автобусник с шашками наголо)
    score -= 42;
    desc = `Тактический диссонанс: тренер ставит ${COACH_STYLES_INFO[coachStyle].title}, а команда играет в противофазе (${COACH_STYLES_INFO[teamOrientation]?.title || teamOrientation}). Возникают разрывы между линиями и потери.`;
  } else {
    score -= 15;
    desc = `Умеренные разногласия: тактические требования наставника не полностью ложатся на схему и привычки игроков.`;
  }

  // Учет схемы тренера
  const favored = COACH_STYLES_INFO[coachStyle].favoredFormations || [];
  if (favored.includes(teamFormation)) {
    score += 8;
  } else if (teamFormation.startsWith('5-') && coachStyle === 'attack') {
    score -= 10;
  } else if (teamFormation.startsWith('3-') && coachStyle === 'bus') {
    score -= 8;
  }

  score = Math.max(15, Math.min(100, score));

  let status: 'excellent' | 'good' | 'neutral' | 'poor' | 'clash' = 'neutral';
  let statusTitle = 'Умеренная совместимость';
  let statusBadgeClass = 'neutral';

  let xgMultiplier = 1.0;
  let xgaMultiplier = 1.0;
  let defenseBonus = 0;
  let tackleBonus = 0;
  let foulModifier = 1.0;

  if (score >= 85) {
    status = 'excellent';
    statusTitle = 'Идеальная синергия';
    statusBadgeClass = 'top';
    xgMultiplier = coachStyle === 'attack' || coachStyle === 'possession' ? 1.15 : 1.08;
    xgaMultiplier = coachStyle === 'bus' || coachStyle === 'counter' ? 0.85 : 0.92;
    defenseBonus = 0.2;
    tackleBonus = 0.25;
    foulModifier = 0.85;
  } else if (score >= 70) {
    status = 'good';
    statusTitle = 'Высокая сыгранность';
    statusBadgeClass = 'gold';
    xgMultiplier = 1.06;
    xgaMultiplier = 0.94;
    defenseBonus = 0.1;
    tackleBonus = 0.12;
  } else if (score >= 50) {
    status = 'neutral';
    statusTitle = 'Рабочая стабильность';
    statusBadgeClass = 'playoff';
    xgMultiplier = 1.0;
    xgaMultiplier = 1.0;
  } else if (score >= 35) {
    status = 'poor';
    statusTitle = 'Тактический разлад';
    statusBadgeClass = 'bad';
    xgMultiplier = 0.90;
    xgaMultiplier = 1.14;
    foulModifier = 1.2;
  } else {
    status = 'clash';
    statusTitle = 'Тактический кризис';
    statusBadgeClass = 'bad';
    xgMultiplier = 0.82;
    xgaMultiplier = 1.25;
    foulModifier = 1.35;
  }

  return {
    score,
    status,
    statusTitle,
    statusBadgeClass,
    xgMultiplier,
    xgaMultiplier,
    defenseBonus,
    tackleBonus,
    foulModifier,
    description: desc
  };
}
