// Данные и контакты редактируются здесь, независимо от оформления.
export const config = {
  phone: '+79108864000',
  telegram: '', // Полная ссылка https://t.me/…
  address: 'Нижний Новгород, Московское шоссе',
  house: '52д',
  hours: '', // Подтвердить режим из наброска: ежедневно 09:00–21:00.
  heroVideo: './assets/main_video.mp4', // Локальный путь, например ./assets/hero.mp4.
  maintenanceApiUrl: 'https://script.google.com/macros/s/AKfycbywj_kGPQSc5q6INEe4BN16CkNQn37IqG3JRzYS3Vmm1tN1RTzAVJe5ncyZvidUjnMg/exec',
};
export const services = [
  { title: 'Техническое обслуживание', items: ['Все расходные материалы в наличии.', 'Не просто замена масла, а полноценное ТО по регламенту производителя.', 'Работы выполняются сертифицированными специалистами.', 'Комфортная клиентская зона.'], action: 'Записаться', target: '#calculator', icon: '01' },
  { title: 'Слесарные работы', items: ['Качественный ремонт любой сложности (включая ремонт агрегатов).', 'Оригинальные запасные части.', 'Гарантия на выполнение ремонта.', 'Все работы под контролем технического эксперта Hyundai.'], action: 'Записаться', target: '#contacts', icon: '02' },
  { title: 'Агрегатный ремонт', items: [{ text: 'Ремонт всех ДВС (Hyundai, KIA, Genesis), в том числе Smartstream.', emphasis: 'Smartstream' }, 'Ремонт АКПП.', 'Ремонт систем полного привода.'], action: 'Записаться', target: '#contacts', icon: '03' },
  { title: 'Диагностика', items: ['Выполняем диагностику любой сложности.', 'Поиск и устранение любой неисправности.', 'Имеем всё необходимое оборудование для качественной диагностики.'], action: 'Записаться', target: '#contacts', icon: '04' },
  { title: 'Детейлинг и тюнинг', columns: [{ title: 'Детейлинг', items: ['Полировка кузова.', 'Химчистка салона.', 'Обработка кузова.'] }, { title: 'Тюнинг', items: ['Тонировка стекол/фар.', 'Оклейка кузова пленкой.'] }], action: 'Записаться', target: '#contacts', icon: '05' },
  { title: 'Чип-тюнинг', items: ['Увеличение мощности ДВС.', 'Оптимизация настроек.', 'Стабилизация работы ДВС.', 'Быстро, качественно, с гарантией.'], action: 'Записаться', target: '#contacts', icon: '06' },
];
export const team = [
  { name: 'Тимофей Дмитриев', role: 'Руководитель ремонтного цеха', image: 'timofey.jpg', photos: [{ kind: 'portrait', alt: 'Портрет — заглушка' }, { kind: 'certificate', alt: 'Сертификат — заглушка' }], text: 'Диагностика, технические вопросы и организация ремонта.' },
  { name: 'Владислав Матросов', role: 'Директор сервиса', image: 'vladislav.jpg', photos: [{ kind: 'portrait', alt: 'Портрет — заглушка' }, { kind: 'certificate', alt: 'Сертификат — заглушка' }], text: 'Организация работы команды и клиентский сервис.' },
  { name: 'Вадим Смирнов', role: 'Старший сервисный консультант', image: 'vadim.jpg', photos: [{ kind: 'portrait', alt: 'Портрет — заглушка' }, { kind: 'certificate', alt: 'Сертификат — заглушка' }], text: 'Обсуждение задач и сопровождение обслуживания.' },
];

// Альбомы пространства сервиса. Порядок соответствует карточкам в index.html.
export const spaceAlbums = [
  [
    { src: './assets/service_center/service_center_1.jpg', alt: 'Сервисный центр Service Car Team' },
    { src: './assets/service_center/service_center_2.jpg', alt: 'Ремонтный цех сервисного центра' },
  ],
  [
    { src: './assets/client_area/client_area_1.jpg', alt: 'Клиентская зона Service Car Team' },
    { src: './assets/client_area/client_area_2.jpg', alt: 'Место ожидания в клиентской зоне' },
    { src: './assets/client_area/client_area_3.jpg', alt: 'Интерьер клиентской зоны' },
  ],
  [
    { src: './assets/repair/repair_1.jpg', alt: 'Рабочий процесс в сервисном центре' },
    { src: './assets/repair/repair_2.jpg', alt: 'Диагностика подвески автомобиля' },
    { src: './assets/repair/repair_3.jpg', alt: 'Компьютерная диагностика автомобиля' },
    { src: './assets/repair/repair_4.jpg', alt: 'Ремонт автомобиля в сервисном центре' },
    { src: './assets/repair/repair_5.jpg', alt: 'Работа специалистов Service Car Team' },
  ],
  [
    { src: './assets/tools/tool_1.jpg', alt: 'Профессиональное оборудование сервисного центра' },
    { src: './assets/tools/tool_3.jpg', alt: 'Оборудование для диагностики автомобиля' },
    { src: './assets/tools/tool_4.jpg', alt: 'Инструменты для ремонта автомобиля' },
    { src: './assets/tools/tool_5.jpg', alt: 'Техническое оборудование Service Car Team' },
    { src: './assets/tools/tool_6.jpg', alt: 'Оборудование ремонтной зоны' },
  ],
];
