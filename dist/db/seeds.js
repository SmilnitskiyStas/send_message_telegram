"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedStores = seedStores;
exports.seedUsers = seedUsers;
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
const STORES = [
    { code: '1', name: 'М1/1', address: 'м.Житомир, пр-т Миру, 15' },
    { code: '2', name: 'М2', address: 'вул.Володимирська, 73/77' },
    { code: '3', name: 'М3', address: 'вул.Р.Окипної, 3' },
    { code: '4', name: 'М4/1', address: 'смт.Коцюбинське, вул.Пономарьова, 28А' },
    { code: '5', name: 'М5', address: 'вул.Якуба Коласа, 2' },
    { code: '6', name: 'М6', address: 'вул.Сікорського, 1А' },
    { code: '7', name: 'М7', address: 'вул.Є.Коновальця, 44Б' },
    { code: '8', name: 'М8', address: 'м.Ірпінь, вул.10 Лінія, 1Б' },
    { code: '9', name: 'М9', address: 'м.Бровари, вул.Шолом-Алейхема, 68' },
    { code: '10', name: 'М10', address: 'пр-т В.Івасюка, 65Б' },
    { code: '11', name: 'М11/1', address: 'вул.Автозаводська, 27' },
    { code: '12', name: 'М12', address: 'вул.Антоновича, 115Д' },
    { code: '13', name: 'М13/1', address: 'с.Тарасівка, вул.Братів Чмілів, 3А' },
    { code: '14', name: 'М14', address: 'вул.Світла, 3Д' },
    { code: '15', name: 'М15', address: 'вул.Шолом-Алейхема, 10А' },
    { code: '16', name: 'М16', address: 'пр.Р.Шехевича, 11А' },
    { code: '17', name: 'М17/1', address: 'м.Бориспіль, вул.Головатого, 64' },
    { code: '20', name: 'М20', address: 'вул.Бориспільська, 32А' },
    { code: '21', name: 'М21', address: 'м.Ірпінь, вул.М.Донцова, 50Б' },
    { code: '22', name: 'М22', address: 'вул.Вітряні гори, 21/7' },
    { code: '23', name: 'М23', address: 'бул.В.Гавела, 18' },
    { code: '24', name: 'М24/1', address: 'смт.Глеваха, вул.Ботанічна, 34' },
    { code: '25', name: 'М25', address: 'с.С.Борщагівка, вул.Чубинського, 8В' },
    { code: '26', name: 'М26', address: 'вул.С.Данченка, 30' },
    { code: '27', name: 'М27', address: 'вул.Радистів, 14' },
    { code: '31', name: 'М31', address: 'вул.Вітрука, 19' },
    { code: '32', name: 'М32', address: 'вул.М.Закревського, 47А' },
    { code: '33', name: 'М33', address: 'м.Бровари, вул.Київська, 95' },
    { code: '35', name: 'М35', address: 'вул.О.Пчілки, 7Б' },
    { code: '36', name: 'М36', address: 'м.Буча, пров.О.Тихого, 4' },
    { code: '37', name: 'М37', address: 'пр-т Повітрофлотський, 19-А/1' },
    { code: '38', name: 'М38', address: 'м.Чернігів, вул.Всіхсвятська, 5' },
    { code: '40', name: 'М40', address: 'м.Б.Церква, вул.Митрофанова, 8' },
    { code: '41', name: 'М41', address: 'м.Б.Церква, вул.Сквирське шосе, 223' },
    { code: '42', name: 'М42', address: 'смт.Гора, вул.Центральна, 20А' },
    { code: '43', name: 'М43', address: 'м.Боярка, вул.Бульварна, 2/50' },
];
// Дані з CSV (shop_number → числовий код магазину)
const USERS = [
    { chat_id: 591179640, username: 'StasSmilnitskiy', last_name: 'Смільницький', first_name: 'Станіслав', middle_name: 'Степанович', position: 'Керівник магазину', phone: '380668809692', shop_code: '12', role: 'employee' },
    { chat_id: 650818212, username: '', last_name: 'Ромась', first_name: 'Зінаїда', middle_name: 'Миколаївна', position: 'Охорона', phone: '380997664713', shop_code: '1', role: 'security' },
    { chat_id: 6188469320, username: '', last_name: 'Денисюк', first_name: 'Анна', middle_name: 'Сергіївна', position: 'Керівник магазину', phone: '380672999437', shop_code: '31', role: 'employee' },
    { chat_id: 1308180163, username: 'valeraserbin', last_name: 'Сербін', first_name: 'Валерій', middle_name: 'Григорович', position: 'Охорона', phone: '380685877691', shop_code: '9', role: 'security' },
    { chat_id: 842967370, username: 'Yaroslavhh', last_name: 'Чеховський', first_name: 'Ярослав', middle_name: 'Вікторович', position: 'Охорона', phone: '932715330', shop_code: '9', role: 'security' },
    { chat_id: 5523705095, username: '', last_name: 'Бойчук', first_name: 'Віктор', middle_name: 'Ігорович', position: 'Охорона', phone: '80630229801', shop_code: '9', role: 'security' },
    { chat_id: 5240828056, username: '', last_name: 'Гудкова', first_name: 'Оксана', middle_name: 'Вікторівна', position: 'Охорона', phone: '995563441', shop_code: '9', role: 'security' },
    { chat_id: 5091287990, username: 'Alex_Bee_Ready', last_name: 'Редченко', first_name: 'Олександр', middle_name: 'Анатолійович', position: 'Охорона', phone: '380672454784', shop_code: '9', role: 'security' },
    { chat_id: 914929556, username: 'Vitalik123123', last_name: 'Антонов', first_name: 'Віталій', middle_name: 'Вікторович', position: 'Охорона', phone: '380680950070', shop_code: '9', role: 'security' },
    { chat_id: 830745489, username: 'natacrystal12', last_name: 'Гончарова', first_name: 'Наталія', middle_name: 'Василівна', position: 'Охорона', phone: '954842516', shop_code: '37', role: 'security' },
];
function seedStores() {
    const db = (0, index_1.getDb)();
    const upsert = db.prepare(`
    INSERT INTO stores (name, code, address)
    VALUES (?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, address = excluded.address
  `);
    for (const s of STORES)
        upsert.run([s.name, s.code, s.address]);
    logger_1.logger.info({ count: STORES.length }, 'Stores seeded');
}
function seedUsers() {
    const db = (0, index_1.getDb)();
    // Отримуємо map code → store_id
    const stores = db.prepare('SELECT id, code FROM stores').all([]);
    const storeMap = {};
    for (const s of stores)
        storeMap[s.code] = s.id;
    const upsert = db.prepare(`
    INSERT INTO users
      (last_name, first_name, middle_name, phone, position, store_id,
       telegram_chat_id, telegram_username, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      last_name        = excluded.last_name,
      first_name       = excluded.first_name,
      middle_name      = excluded.middle_name,
      phone            = excluded.phone,
      position         = excluded.position
    -- НЕ оновлюємо: is_active, role, store_id, telegram_username
    -- (ці поля керуються через адмін-панель і не мають скидатись при рестарті)
  `);
    let count = 0;
    for (const u of USERS) {
        const storeId = storeMap[u.shop_code] ?? null;
        if (!storeId) {
            logger_1.logger.warn({ shop_code: u.shop_code, name: u.last_name }, 'Store not found for user, skipping');
            continue;
        }
        upsert.run([
            u.last_name, u.first_name, u.middle_name, u.phone, u.position,
            storeId, u.chat_id, u.username || null, u.role,
        ]);
        count++;
    }
    logger_1.logger.info({ count }, 'Users seeded');
}
//# sourceMappingURL=seeds.js.map