"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useEffect } from "react";
import {
  Building2,
  Sparkles,
  Hammer,
  Home,
  ShoppingBag,
  Palette,
  Phone,
  Mail,
  MapPin,
  ArrowRight,
  Star,
  CheckCircle2,
  Play,
  Award,
  Shield,
  Clock,
} from "lucide-react";
import { ImageSlider } from "@/components/landing/ImageSlider";
import { ServiceAccordion } from "@/components/landing/ServiceAccordion";
import { TeamCarousel } from "@/components/landing/TeamCarousel";
import { ProjectGallery } from "@/components/landing/ProjectGallery";
import { MobileMenu } from "@/components/landing/MobileMenu";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

const CDN = "https://cdn.prod.website-files.com";

const HERO_SLIDES = [
  { src: `${CDN}/6641d906bd4671099f4032c2/6648aa8b0bd6e80447f6cda6_hero-img.webp`, alt: "Metrum Group — будівництво" },
  { src: `${CDN}/6641d906bd4671099f4032c2/66499d650815bc94183e86e8_building.webp`, alt: "Будівництво об'єктів" },
  { src: `${CDN}/6641d906bd4671099f4032c2/66499d6500d829a5470df1c2_repair.webp`, alt: "Ремонтні роботи" },
  { src: `${CDN}/6641d906bd4671099f4032c2/67cd69bbc6708f96ebdaa9e7_cover.avif`, alt: "PARK Hiking Club" },
];

const SERVICES = [
  {
    icon: Building2,
    title: "Будівництво",
    desc: "Забезпечуємо повний цикл будівельних робіт, гарантуючи якість і надійність на кожному етапі. Наша спеціалізація включає будівництво житлових комплексів, офісних будівель, торгових центрів, готелів, медичних закладів та інфраструктурних об'єктів.",
    features: ["Житлові комплекси", "Офісні будівлі", "Торгові центри", "Готелі", "Медичні заклади", "Інфраструктура"],
    image: `${CDN}/6641d906bd4671099f4032c2/66499d650815bc94183e86e8_building.webp`,
  },
  {
    icon: Hammer,
    title: "Ремонт",
    desc: "Пропонуємо комплексні ремонтні рішення будь-якої складності, від косметичного до капітального ремонту, що відповідають сучасним стандартам та вашим індивідуальним потребам. 3-річна гарантія на всі роботи.",
    features: ["Капітальний ремонт", "Косметичний ремонт", "3-річна гарантія", "Під ключ", "Комерційні об'єкти", "Житлові квартири"],
    image: `${CDN}/6641d906bd4671099f4032c2/66499d6500d829a5470df1c2_repair.webp`,
  },
  {
    icon: Palette,
    title: "Дизайн інтер'єру",
    desc: "Розробляємо унікальні інтер'єрні рішення, що поєднують естетику, функціональність і ваші особисті вподобання. Від концепції до реалізації.",
    features: ["3D візуалізація", "Авторський нагляд", "Підбір матеріалів", "Планування простору", "Комерційний дизайн", "Житловий дизайн"],
    image: `${CDN}/6641d906bd4671099f4032c2/67cd755350d85994e2f2ddf2_reception.avif`,
  },
  {
    icon: ShoppingBag,
    title: "Продаж нерухомості",
    desc: "Супроводжуємо процес купівлі та продажу нерухомості, роблячи його максимально прозорим та безпечним. Юридичний супровід на кожному етапі угоди.",
    features: ["Юридичний супровід", "Оцінка нерухомості", "Пошук покупців", "Документація", "Безпечна угода", "Консультації"],
    image: `${CDN}/6641d906bd4671099f4032c2/66499d6500d829a5470df1aa_rent%20Large.webp`,
  },
  {
    icon: Home,
    title: "Оренда",
    desc: "Знаходимо оптимальні варіанти оренди житлових і комерційних приміщень та ведемо вас на всіх етапах: від пошуку відповідного приміщення до підписання угоди.",
    features: ["Житлова оренда", "Комерційна оренда", "Підбір варіантів", "Перевірка об'єктів", "Супровід угоди", "Консультації"],
    image: `${CDN}/6641d906bd4671099f4032c2/66499d6500d829a5470df1aa_rent%20Large.webp`,
  },
  {
    icon: Sparkles,
    title: "Клінінг",
    desc: "Професійно та ретельно доглядаємо за вашими житловими та комерційними приміщеннями, щоб створити ідеальну чистоту та комфорт.",
    features: ["Після ремонту", "Регулярне прибирання", "Глибоке чищення", "Комерційний клінінг", "Миття вікон", "Хімчистка"],
    image: `${CDN}/6641d906bd4671099f4032c2/67cd75bf8d5ffe576d427949_spa-2.avif`,
  },
];

const TEAM = [
  {
    name: "Шиба Ігор",
    role: "Генеральний директор (CEO)",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/68371c2495c0ee96f0b21ff8_YKomar_preview-6.jpg`,
    description: "Засновник та стратегічний лідер компанії. Відповідає за загальне управління, розвиток бізнесу та ключові партнерства. Більше 10 років досвіду в нерухомості та будівництві.",
  },
  {
    name: "Лащук Володимир",
    role: "Фінансовий директор",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/665314c9fc8242bb156ca6b8_SER_0414-%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82%20%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F.jpg`,
    description: "Керує фінансовою стратегією компанії, бюджетуванням проєктів та інвестиційними рішеннями. Забезпечує прозорість та ефективність всіх фінансових процесів.",
  },
  {
    name: "Іванчихіна Юлія",
    role: "Директорка агентства нерухомості",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/66555dcdbcc30243dbb5f4da_SER_0347-%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82-2%20%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F%202.jpg`,
    description: "Очолює напрямок продажу та оренди нерухомості. Забезпечує клієнтам найкращі умови угод з повним юридичним супроводом.",
  },
  {
    name: "Шахов Роман",
    role: "Керівник студії дизайну та ремонту",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/66555dbb181b26e63d5b15a1_SER_0386-%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82%20%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F.jpg`,
    description: "Відповідає за всі проєкти з дизайну інтер'єру та ремонту. Створює унікальні простори, що поєднують естетику з функціональністю.",
  },
  {
    name: "Пехник Андрій",
    role: "Головний інженер",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/673f257986d340e2538f5ff6_%D1%96%D0%BD%D0%B6%D0%B5%D0%BD%D0%B5%D1%80.jpg`,
    description: "Технічний керівник всіх будівельних проєктів. Контролює якість виконання робіт, дотримання будівельних норм та безпеку на об'єктах.",
  },
  {
    name: "Пехник Христина",
    role: "Кошторисниця",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/6740ace35a05ab46461bc06f_%D1%85%D1%80%D0%B8%D1%81%D1%82%D0%B8%D0%BD%D0%B0.jpg`,
    description: "Розраховує кошториси та контролює бюджети проєктів. Забезпечує точність розрахунків та оптимізацію витрат без втрати якості.",
  },
  {
    name: "Синиця Любомир",
    role: "Виконроб",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/6740abebeb7c32e39f12e27b_%D1%81%D0%B8%D0%BD%D0%B8%D1%86%D1%8F.jpg`,
    description: "Координує роботу бригад на будівельних об'єктах. Контролює терміни, якість матеріалів та дотримання проєктних рішень.",
  },
  {
    name: "Шуневич Анастасія",
    role: "Офіс-менеджер",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/68371ef2af2930644caff67a_IMG_5251.JPEG`,
    description: "Організовує роботу офісу, координує комунікацію між відділами та забезпечує ефективний документообіг компанії.",
  },
  {
    name: "Корольчук Богдан",
    role: "Виконроб",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/6740aaba5f183c68a59aa812_%D0%B1%D0%BE%D0%B3%D0%BB%D0%B0%D0%B3.jpg`,
    description: "Координує будівельні роботи на об'єктах. Контролює якість виконання, дотримання термінів та безпеку на будівельних майданчиках.",
  },
  {
    name: "Петраш Софія",
    role: "Маркетинг менеджерка",
    photo: `${CDN}/6651f24b04f06a1e8e26c415/665314d3cd6cf2f21a8cecd0_SER_0424-%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82.jpg`,
    description: "Відповідає за маркетингову стратегію, просування бренду та digital-комунікації компанії у всіх каналах.",
  },
];

const PROJECTS = [
  { title: "ТОЦ Fabrik", category: "Генпідряд", area: "6 000 м²", location: "Львів", price: "$130/м²", image: `${CDN}/6651f24b04f06a1e8e26c415/66bc7bfd3e5337499c75af3a_2023-10-30.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/66bc7bfd3e5337499c75af3a_2023-10-30.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/66bc7b59e5e91e5cbbe65566_e78aa742-51aa-4359-a777-71d4fd82d941.jpg`], description: "Торгово-офісний центр, генеральний підряд" },
  { title: "БЦ VERTYCAL", category: "Генпідряд", area: "14 000 м²", location: "Львів", price: "$220/м²", image: `${CDN}/6651f24b04f06a1e8e26c415/6651f8d7c10a31cf182634ca_vertycal.webp`, images: [`${CDN}/6651f24b04f06a1e8e26c415/6651f8d7c10a31cf182634ca_vertycal.webp`, `${CDN}/6651f24b04f06a1e8e26c415/6651f8d381cd428818d8a622_vertycal%202.webp`], description: "Бізнес-центр класу А" },
  { title: "ТРЦ Вектор", category: "Генпідряд", area: "9 000 м²", location: "Трускавець", price: "$120/м²", image: `${CDN}/6651f24b04f06a1e8e26c415/66869b8f2cfd5987ecc99ee6_0x0%20(1).jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/66869b8f2cfd5987ecc99ee6_0x0%20(1).jpg`, `${CDN}/6651f24b04f06a1e8e26c415/66869ba4ad7536bf39e2a17a_0x0.jpg`], description: "Торгово-розважальний центр" },
  { title: "ТРЦ Майдан", category: "Генпідряд", area: "18 000 м²", location: "Червоноград", price: "$90/м²", image: `${CDN}/6651f24b04f06a1e8e26c415/66743efb15a5dfd438fc4382_8b2f8887-2bd2-48dd-9c9d-e97dfacc9318.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/66743efb15a5dfd438fc4382_8b2f8887-2bd2-48dd-9c9d-e97dfacc9318.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/66744b16eca7bcc9f813bd67_111-min.jpeg`], description: "Найбільший ТРЦ у місті" },
  { title: "PARK Hiking Club", category: "Інвестиційний", area: "Котеджний комплекс", location: "Карпати, Яблуниця", image: `${CDN}/6641d906bd4671099f4032c2/67cd69bbc6708f96ebdaa9e7_cover.avif`, images: [`${CDN}/6641d906bd4671099f4032c2/67cd69bbc6708f96ebdaa9e7_cover.avif`, `${CDN}/6641d906bd4671099f4032c2/67cd71768d5ffe576d3f7584_panoram%20view.avif`, `${CDN}/6641d906bd4671099f4032c2/67cd755350d85994e2f2ddf2_reception.avif`, `${CDN}/6641d906bd4671099f4032c2/67cd75bf8d5ffe576d427949_spa-2.avif`, `${CDN}/6641d906bd4671099f4032c2/67ced8f302540a36f765b6a0_2025-03-10%2014.19.27.avif`, `${CDN}/6641d906bd4671099f4032c2/67cd7f975863caa70b6ab53a_010000.avif`], description: "15-20% зростання вартості, 8-10% пасивного доходу" },
  { title: "Natuzzi Store", category: "Комерційний ремонт", area: "410 м²", location: "Львів", price: "$65 000", image: `${CDN}/6651f24b04f06a1e8e26c415/665406127bbab284537625da_IMG_1748.jpeg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/665406127bbab284537625da_IMG_1748.jpeg`, `${CDN}/6651f24b04f06a1e8e26c415/6654061c49613dcb7e2088da_IMG_1799.jpeg`], description: "Меблевий шоурум преміум-класу" },
  { title: "Dental Clinic Dr. Bunia", category: "Комерційний ремонт", area: "265 м²", location: "Львів", price: "$450/м²", image: `${CDN}/6651f24b04f06a1e8e26c415/6672a55610785c384517f0b8_c7303158-2e1a-4986-b117-83a456e52049.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/6672a55610785c384517f0b8_c7303158-2e1a-4986-b117-83a456e52049.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/6686a614ccbb174c9f36e4a3_78839930-8151-495d-b6cb-9140deac8d83.jpg`], description: "Стоматологічна клініка" },
  { title: "ЖК Лінкольн 147 м²", category: "Житловий ремонт", area: "147 м²", location: "Львів", image: `${CDN}/6651f24b04f06a1e8e26c415/67459c131d72c3708ec30917_%D0%BA%D0%B21.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/67459c131d72c3708ec30917_%D0%BA%D0%B21.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/67459c1f33d12a4110cf730f_%D0%BA%D0%B26.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/67459062cb1762814f375661_3%20%D0%BA%D0%BB.jpg`], description: "Дизайнерський ремонт квартири" },
  { title: "SHOco Кондитерська", category: "Комерційний ремонт", area: "328 м²", location: "Львів", image: `${CDN}/6651f24b04f06a1e8e26c415/67ae1429c379ad50bfd35fde_IMG_5676.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/67ae1429c379ad50bfd35fde_IMG_5676.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/67ae17b6ae5f12b505ebb8f6_IMG_5686.JPG`], description: "Кондитерська з авторським дизайном" },
  { title: "Orlan Residents", category: "Комерційний ремонт", area: "65 м²", location: "Львів", image: `${CDN}/6651f24b04f06a1e8e26c415/67e433c5f5856b1539d63abb_3.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/67e433c5f5856b1539d63abb_3.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/67e4336e73a5f19521c88794_3%D1%81-2.jpg`], description: "Офіс продажів забудовника" },
  { title: "Phoenix Invest", category: "Комерційний ремонт", area: "120 м²", location: "Ворохта", image: `${CDN}/6651f24b04f06a1e8e26c415/67c6f5bfef487daed20f4e1f_4.jpg`, images: [`${CDN}/6651f24b04f06a1e8e26c415/67c6f5bfef487daed20f4e1f_4.jpg`, `${CDN}/6651f24b04f06a1e8e26c415/67c6f5b9ef487daed20f4770_2507f0c7-5f22-48f2-a297-054861f0faaf.jpg`], description: "Офіс продажів у Карпатах" },
  { title: "Ukrainian Spirit", category: "Комерційний ремонт", area: "45 м²", location: "Львів", price: "$34 000", image: `${CDN}/6651f24b04f06a1e8e26c415/665230a0189663a1ea8fd478_ukrainian%20spirit%2001.webp`, images: [`${CDN}/6651f24b04f06a1e8e26c415/665230a0189663a1ea8fd478_ukrainian%20spirit%2001.webp`, `${CDN}/6651f24b04f06a1e8e26c415/6652309d0a4ce7291290f69c_ukrainian%20spirit%2002.webp`], description: "Магазин з національним дизайном" },
];

const REVIEWS = [
  { name: "Анастасія", text: "Дуже задоволена співпрацею! Команда працювала чітко, дотримувались всіх термінів. Якість ремонту на вищому рівні. Окремо дякую за прозору звітність — завжди знали, на що йдуть кошти.", rating: 5 },
  { name: "Павло Овсянкін", text: "Купив 1-кімнатну квартиру 40 м² за $54,500, зробили ремонт за $20,000 — продали за $93,000. Повний юридичний супровід, прозора звітність, якісні матеріали. Рекомендую!", rating: 5 },
  { name: "Ірина", text: "Від дизайну до здачі ключів — все було організовано бездоганно. Роман та його команда створили простір, про який ми мріяли. Окреме дякую за юридичний супровід і терпіння.", rating: 5 },
  { name: "Петро", text: "Замовляв генпідряд на комерційний об'єкт. Професійний підхід на кожному етапі. Дотримались бюджету та термінів. Якість будівельних робіт — на найвищому рівні.", rating: 5 },
  { name: "Анна Кипарис", text: "Metrum Group допомогли знайти ідеальну квартиру у Львові та супроводили весь процес купівлі. Юристи перевірили всі документи. Все пройшло швидко та безпечно.", rating: 5 },
  { name: "Юрій", text: "Робили ремонт квартири під ключ. Дизайн-проєкт, матеріали, бригада — все було організовано ідеально. Результат перевершив очікування. Гарантія 3 роки — це впевненість.", rating: 5 },
];

const PARTNER_LOGOS = [
  { name: "Rozetka", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2a4f72c68948e372758_Rozetka%20Logo.webp` },
  { name: "Nova Poshta", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f289b4002a1cade887db_Nova%20Poshta%20logo.webp` },
  { name: "Silpo", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f284fb6861774965e5a6_Silpo%20outline%20logo.webp` },
  { name: "Foxtrot", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f29dd7109a425dd3bfcb_Foxtrot%20logo.webp` },
  { name: "JYSK", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f27bfec6c5561c686102_Jysk%20logo.webp` },
  { name: "Natuzzi", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2c2422151c38374edca_Natuzzi%20Logo.webp` },
  { name: "Eldorado", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2dae49800ec95b076aa_Eldorado%20logo.webp` },
  { name: "Sinsay", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2d2e49800ec95b070de_Sinsay%20logo.webp` },
  { name: "Fabrik", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f294f01810f349663758_Fabrik%20logo.webp` },
  { name: "Wine Time", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2cb588b161c6dd2fd08_Wine%20Time%20logo.webp` },
  { name: "Prostor", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2bc07da7d15caf1024c_Prostor%20logo.webp` },
  { name: "VERTYCAL", src: `${CDN}/6651f24b04f06a1e8e26c415/6651f2b5d31644ee8aa4d8ff_VERTYCAL.webp` },
];

const DEV_PARTNERS = [
  { name: "Lev Group", src: `${CDN}/6651f24b04f06a1e8e26c415/68dbc2ff3a6e9fa67b462dc4_lev-logo-white.svg` },
  { name: "Мій Дім", src: `${CDN}/6651f24b04f06a1e8e26c415/68dbc2ec430ee047c698c65e_miy-dim%201.svg` },
  { name: "Галжитлобуд", src: `${CDN}/6651f24b04f06a1e8e26c415/68dbc2e2a61c897fae002aa0_%D0%B3%D0%B0%D0%BB%D0%B6%D0%B8%D1%82%D0%BB%D0%BE%D0%B1%D1%83%D0%B4%201.svg` },
  { name: "Phoenix Dev", src: `${CDN}/6651f24b04f06a1e8e26c415/68dbc2b8de601d6494134264_pheonix%20dev.png` },
  { name: "Viking Dev", src: `${CDN}/6651f24b04f06a1e8e26c415/68ac4275b06b7f3746b80495_viking%20dev.svg` },
  { name: "Frame", src: `${CDN}/6651f24b04f06a1e8e26c415/68ac4226dc6dabede066a5bc_Frame.svg` },
];

const MEDIA_LOGOS = [
  { name: "Minfin", src: `${CDN}/6651f24b04f06a1e8e26c415/670a641c7cb7024ec5ee4f21_Color%20Minfin.svg` },
  { name: "032.ua", src: `${CDN}/6651f24b04f06a1e8e26c415/670a651cf41cb1c7266deedc_Logo%20261x80.png` },
  { name: "Budynok", src: `${CDN}/6651f24b04f06a1e8e26c415/670a65f07af16b33a01cb215_logoo.png` },
  { name: "Zaxid.net", src: `${CDN}/6651f24b04f06a1e8e26c415/671909d240384f1c18f650c9_Zaxid-net%20%D0%B2%D0%B5%D0%BB%D0%B8%D0%BA%D0%B8%D0%B9%20(3).jpg` },
  { name: "Tvoe Misto", src: `${CDN}/6651f24b04f06a1e8e26c415/67190aeec9004e0511f6e67b_294613708_444704157676300_6011877906834205527_n.jpg` },
];

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      document.documentElement.classList.add("smooth");
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#111111]">
      {/* ════════ HEADER ════════ */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-dark">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <Image src="/images/metrum-logo.svg" alt="Metrum Group" width={130} height={30} className="h-7 w-auto invert" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {["послуги", "портфоліо", "команда", "відгуки", "контакти"].map((item) => (
              <a key={item} href={`#${item}`} className="text-[11px] uppercase tracking-[0.15em] font-medium text-white/70 hover:text-primary transition-colors duration-300">{item}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a href="tel:+380677430101" className="hidden sm:flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors font-mono">
              <Phone className="h-3.5 w-3.5 text-primary" />067 743 01 01
            </a>
            <Link href="/login" className="btn-primary px-5 py-2 text-xs font-semibold text-white">
              Кабінет
            </Link>
            <MobileMenu />
          </div>
        </div>
      </header>

      {/* ════════ HERO ════════ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">
        <motion.div style={{ y: heroY }} className="absolute inset-0">
          <ImageSlider slides={HERO_SLIDES} interval={6000} aspectRatio="" className="h-full rounded-none" overlay={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-transparent to-transparent" />
        </motion.div>

        <div className="relative mx-auto max-w-7xl px-5 py-32">
          <div className="max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <a
                href="/documents/iso-certificate.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="section-badge inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-1.5 mb-8 transition-all duration-300 hover:bg-primary/20 hover:border-primary/30 hover:scale-105 cursor-pointer"
              >
                <Award className="h-3.5 w-3.5 text-primary" />
                [01] ISO сертифікований партнер • Forbes Next 250
              </a>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-7xl leading-[1.08]"
            >
              Ваш надійний
              <br />
              партнер в
              <br />
              <span className="gradient-text">нерухомості</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-6 max-w-lg text-base text-white/60 leading-relaxed sm:text-lg"
            >
              Повний спектр послуг: від купівлі ділянки до здачі готового об&apos;єкта. Будівництво, ремонт, дизайн, продаж та оренда нерухомості у Львові.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <a href="#контакти" className="group flex items-center gap-2 btn-primary px-7 py-3.5 text-sm font-semibold text-white">
                Безкоштовна консультація
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#портфоліо" className="flex items-center gap-2 btn-outline px-7 py-3.5 text-sm font-medium text-white/80">
                <Play className="h-4 w-4" /> Наші об&apos;єкти
              </a>
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-xl"
          >
            {[
              { value: "12+", unit: "млн $", label: "продажів нерухомості" },
              { value: "3 000+", unit: "", label: "успішних угод" },
              { value: "200k+", unit: "м²", label: "відремонтовано" },
            ].map((stat) => (
              <div key={stat.label} className="border-l border-white/10 pl-5">
                <p className="text-2xl font-bold text-white sm:text-3xl font-heading">
                  {stat.value}<span className="text-primary text-lg ml-1 font-mono">{stat.unit}</span>
                </p>
                <p className="mt-1 text-xs text-white/50 font-mono">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════ TRUST BAR ════════ */}
      <section className="bg-[#0A0A0A] border-y border-[#2d2d2d] py-8 overflow-hidden">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="flex items-center gap-12 overflow-x-auto scrollbar-thin pb-2">
              {PARTNER_LOGOS.map((partner) => (
                <div key={partner.name} className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-300">
                  <Image src={partner.src} alt={partner.name} width={100} height={40} className="h-8 w-auto object-contain invert brightness-100" />
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ SERVICES ════════ */}
      <section id="послуги" className="bg-[#111111] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="mb-16 max-w-2xl">
              <span className="section-badge">[02] Послуги</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl font-heading text-[#F5F5F0]">Повний цикл послуг</h2>
              <p className="mt-4 text-[#999] leading-relaxed">
                Мета нашої команди проста і чітка: зробити сферу нерухомості доступною і зрозумілою для кожного клієнта.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <ServiceAccordion services={SERVICES} />
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ ADVANTAGES ════════ */}
      <section className="relative bg-[#111111] py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <ImageSlider
            slides={[
              { src: `${CDN}/6641d906bd4671099f4032c2/67cd755350d85994e2f2ddf2_reception.avif`, alt: "Сучасний інтер'єр — reception PARK" },
              { src: `${CDN}/6641d906bd4671099f4032c2/67cd75bf8d5ffe576d427949_spa-2.avif`, alt: "SPA зона — PARK Hiking Club" },
              { src: `${CDN}/6641d906bd4671099f4032c2/67cd71768d5ffe576d3f7584_panoram%20view.avif`, alt: "Панорамний вид з котеджу" },
              { src: `${CDN}/6641d906bd4671099f4032c2/67cd77d34993ee5f26d5fc00_additional%20photos%2001.avif`, alt: "Інтер'єр котеджу" },
              { src: `${CDN}/6641d906bd4671099f4032c2/67cd77d3adfd00776e52f6d6_additional%20photos%2002.avif`, alt: "Дизайн приміщення" },
              { src: `${CDN}/6641d906bd4671099f4032c2/6649cb0cc8ee166d5ac623ea_team%20photo.jpg`, alt: "Команда Metrum Group" },
            ]}
            interval={4000}
            aspectRatio=""
            className="h-full rounded-none"
            overlay={false}
          />
          <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
            <div>
              <ScrollReveal>
                <span className="section-badge">[03] Переваги</span>
                <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl font-heading">
                  Чому обирають<br />Metrum Group
                </h2>
                <p className="mt-4 text-white/55 max-w-md leading-relaxed">
                  Ми поєднуємо міжнародні стандарти якості з індивідуальним підходом до кожного клієнта.
                </p>
              </ScrollReveal>
              <div className="mt-10 space-y-5">
                {[
                  { icon: Shield, title: "ISO стандарти якості", desc: "Сертифікований партнер INTSAS. Кожен проєкт виконується відповідно до міжнародних стандартів." },
                  { icon: Clock, title: "3-річна гарантія", desc: "На всі ремонтні роботи надаємо розширену гарантію. Ваша впевненість — наш пріоритет." },
                  { icon: CheckCircle2, title: "Прозора звітність", desc: "Особистий кабінет з відстеженням прогресу, фінансів та фотозвітів у реальному часі." },
                  { icon: Award, title: "Досвід та масштаб", desc: "3 000+ успішних проєктів, 200 000+ м² виконаних робіт, 10+ спеціалістів у команді." },
                ].map((item, i) => (
                  <ScrollReveal key={item.title} delay={0.1 * (i + 1)}>
                    <div className="group flex gap-4 p-3 -mx-3 transition-colors duration-300 hover:bg-white/5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 flex-shrink-0 group-hover:bg-primary/20 transition-colors duration-300">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{item.title}</h3>
                        <p className="mt-1 text-sm text-white/60 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              <ScrollReveal direction="right">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 relative aspect-[16/9] overflow-hidden group">
                    <Image
                      src={`${CDN}/6641d906bd4671099f4032c2/67cd755350d85994e2f2ddf2_reception.avif`}
                      alt="Сучасний дизайн інтер'єру"
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-medium text-white font-mono">
                        <Sparkles className="h-3 w-3 text-primary" /> PARK Hiking Club — Reception
                      </span>
                    </div>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden group">
                    <Image
                      src={`${CDN}/6641d906bd4671099f4032c2/67cd75bf8d5ffe576d427949_spa-2.avif`}
                      alt="SPA зона"
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-xs font-medium text-white/80 font-mono">SPA & Wellness</span>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden group">
                    <Image
                      src={`${CDN}/6641d906bd4671099f4032c2/67cd71768d5ffe576d3f7584_panoram%20view.avif`}
                      alt="Панорамний вид"
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-xs font-medium text-white/80 font-mono">Panoramic View</span>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 p-4 text-center">
                    <p className="text-2xl font-bold text-white font-heading">3 000+</p>
                    <p className="text-xs text-white/60 mt-0.5 font-mono">проєктів</p>
                  </div>
                  <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 p-4 text-center">
                    <p className="text-2xl font-bold text-white font-heading">200k+</p>
                    <p className="text-xs text-white/60 mt-0.5 font-mono">м² ремонту</p>
                  </div>
                  <div className="flex-1 bg-primary/15 border border-primary/25 p-4 text-center">
                    <p className="text-2xl font-bold text-primary font-heading">3 роки</p>
                    <p className="text-xs text-white/60 mt-0.5 font-mono">гарантії</p>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ PORTFOLIO ════════ */}
      <section id="портфоліо" className="bg-[#111111] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="mb-12">
              <span className="section-badge">[04] Портфоліо</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl font-heading text-[#F5F5F0]">Наші об&apos;єкти</h2>
              <p className="mt-4 text-[#999] max-w-2xl">
                Більше 200 000 м² якісно виконаних робіт — від торгових центрів до дизайнерських квартир.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <ProjectGallery
              projects={PROJECTS}
              categories={["Генпідряд", "Комерційний ремонт", "Житловий ремонт", "Інвестиційний"]}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ TEAM ════════ */}
      <section id="команда" className="bg-[#1A1A1A] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="section-badge">[05] Команда</span>
                <h2 className="mt-3 text-3xl font-bold sm:text-4xl font-heading text-[#F5F5F0]">Люди, яким довіряють</h2>
                <p className="mt-4 text-[#999] max-w-lg">
                  Наша команда — це професіонали з багаторічним досвідом у будівництві, дизайні та нерухомості.
                </p>
              </div>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <TeamCarousel members={TEAM} />
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ REVIEWS ════════ */}
      <section id="відгуки" className="bg-[#111111] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="mb-16 text-center">
              <span className="section-badge">[06] Відгуки</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl font-heading text-[#F5F5F0]">Що кажуть наші клієнти</h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {REVIEWS.map((review, i) => (
              <ScrollReveal key={review.name} delay={i * 0.08}>
                <div className="border border-[#2d2d2d] bg-[#1A1A1A] p-7 transition-all duration-300 hover:border-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: review.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-[#bbb]">&ldquo;{review.text}&rdquo;</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center bg-primary/15 border border-primary/25 text-primary text-xs font-bold font-heading">
                      {review.name.charAt(0)}
                    </div>
                    <p className="text-sm font-semibold text-[#F5F5F0]">{review.name}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ VIDEO ════════ */}
      <section className="bg-[#0A0A0A] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="section-badge">[07] Відео</span>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl font-heading text-[#F5F5F0]">Дивіться як ми працюємо</h2>
              <p className="mt-4 text-[#999] max-w-xl mx-auto">
                Підхід до кожного проєкту — від першої зустрічі до здачі об&apos;єкта
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <div className="relative max-w-4xl mx-auto aspect-video rounded-xl overflow-hidden border border-[#2d2d2d] shadow-2xl shadow-primary/5">
              <iframe
                src="https://www.youtube.com/embed/52Fw8PTkF54"
                title="Metrum Group — Як ми працюємо"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ DEV PARTNERS & MEDIA ════════ */}
      <section className="bg-[#111111] py-20 border-y border-[#2d2d2d]">
        <div className="mx-auto max-w-7xl px-5">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="section-badge">[08] Партнери-девелопери</span>
              <p className="mt-3 text-[#999] text-sm">Ми співпрацюємо з провідними забудовниками України</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-10 mb-16">
              {DEV_PARTNERS.map((p) => (
                <div key={p.name} className="opacity-60 hover:opacity-100 transition-opacity duration-300">
                  <Image src={p.src} alt={p.name} width={120} height={48} className="h-10 w-auto object-contain brightness-200" />
                </div>
              ))}
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div className="text-center mb-8">
              <p className="text-[#999] text-xs uppercase tracking-widest">Про нас пишуть</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {MEDIA_LOGOS.map((m) => (
                <div key={m.name} className="opacity-50 hover:opacity-100 transition-opacity duration-300 grayscale hover:grayscale-0">
                  <Image src={m.src} alt={m.name} width={100} height={40} className="h-8 w-auto object-contain brightness-150" />
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ════════ CTA + CONTACTS ════════ */}
      <section id="контакти" className="bg-[#111111] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5">
          <div className="grid gap-16 lg:grid-cols-2">
            <ScrollReveal>
              <div>
                <span className="section-badge">[07] Контакти</span>
                <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl font-heading text-balance">
                  Готові розпочати<br />ваш проєкт?
                </h2>
                <p className="mt-4 text-white/55 max-w-md leading-relaxed">
                  Залиште заявку і наш менеджер зв&apos;яжеться з вами протягом 30 хвилин для безкоштовної консультації.
                </p>
                <div className="mt-10 space-y-4">
                  {[
                    { icon: Phone, label: "Телефон", value: "067 743 01 01", href: "tel:+380677430101" },
                    { icon: Mail, label: "Email", value: "contact@metrum.com.ua", href: "mailto:contact@metrum.com.ua" },
                    { icon: MapPin, label: "Адреса", value: "м. Львів, вул. Антоновича, 120", href: undefined },
                  ].map((item) => {
                    const Wrapper = item.href ? "a" : "div";
                    return (
                      <Wrapper key={item.label} {...(item.href ? { href: item.href } : {})} className="flex items-center gap-4 text-white group">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 border border-white/10 group-hover:bg-primary/20 group-hover:border-primary/30 transition-colors duration-300">
                          <item.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-white/55 font-mono">{item.label}</p>
                          <p className="font-semibold">{item.value}</p>
                        </div>
                      </Wrapper>
                    );
                  })}
                </div>
                <div className="mt-10 flex gap-3">
                  {[
                    { label: "IG", href: "https://www.instagram.com/metrum_group/" },
                    { label: "FB", href: "https://www.facebook.com/people/Metrum-Group/61561113946058/" },
                    { label: "TG", href: "https://t.me/metrum_group" },
                  ].map((s) => (
                    <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all duration-300">
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.15}>
              <div className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-8 sm:p-10">
                <h3 className="text-2xl font-bold text-white mb-3 font-heading">Отримайте консультацію</h3>
                <p className="text-sm text-white/60 mb-8 font-mono">Заповніть форму і наш спеціаліст зв&apos;яжеться з вами</p>
                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <input placeholder="Ваше ім'я" className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/50 transition-colors duration-300" />
                  <input type="tel" placeholder="Номер телефону" className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/50 transition-colors duration-300" />
                  <select className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50 transition-colors duration-300">
                    <option className="bg-[#1A1A1A] text-[#999]">Оберіть послугу</option>
                    <option className="bg-[#1A1A1A]">Будівництво</option>
                    <option className="bg-[#1A1A1A]">Ремонт</option>
                    <option className="bg-[#1A1A1A]">Дизайн</option>
                    <option className="bg-[#1A1A1A]">Продаж нерухомості</option>
                    <option className="bg-[#1A1A1A]">Оренда</option>
                    <option className="bg-[#1A1A1A]">Клінінг</option>
                  </select>
                  <textarea placeholder="Розкажіть про ваш проєкт..." rows={3} className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/50 resize-none transition-colors duration-300" />
                  <button type="submit" className="w-full btn-primary py-3.5 text-sm font-semibold text-white">
                    Надіслати заявку
                  </button>
                </form>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="bg-[#0A0A0A] border-t border-[#2d2d2d]">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-4">
                <Image src="/images/metrum-logo.svg" alt="Metrum Group" width={130} height={30} className="h-6 w-auto invert" />
              </div>
              <p className="text-xs text-[#999] leading-relaxed font-mono">
                Ваш надійний партнер в нерухомості та будівництві. м. Львів
              </p>
            </div>
            <div>
              <h4 className="section-badge mb-4">Послуги</h4>
              {["Будівництво", "Ремонт", "Дизайн інтер'єру", "Продаж нерухомості", "Оренда"].map((s) => (
                <p key={s} className="text-xs text-[#999] mb-2 hover:text-white transition-colors cursor-pointer">{s}</p>
              ))}
            </div>
            <div>
              <h4 className="section-badge mb-4">Контакти</h4>
              <p className="text-xs text-[#999] mb-2 font-mono">+380 67 743 01 01</p>
              <p className="text-xs text-[#999] mb-2 font-mono">contact@metrum.com.ua</p>
              <p className="text-xs text-[#999] font-mono">вул. Антоновича, 120, Львів</p>
            </div>
            <div>
              <h4 className="section-badge mb-4">Соціальні мережі</h4>
              <div className="space-y-2">
                <a href="https://www.instagram.com/metrum_group/" target="_blank" rel="noopener noreferrer" className="block text-xs text-[#999] hover:text-primary transition-colors">Instagram</a>
                <a href="https://www.facebook.com/people/Metrum-Group/61561113946058/" target="_blank" rel="noopener noreferrer" className="block text-xs text-[#999] hover:text-primary transition-colors">Facebook</a>
                <a href="https://t.me/metrum_group" target="_blank" rel="noopener noreferrer" className="block text-xs text-[#999] hover:text-primary transition-colors">Telegram</a>
              </div>
            </div>
          </div>
          <div className="border-t border-[#2d2d2d] mt-12 pt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-[#777] font-mono tracking-wider">
              © {new Date().getFullYear()} METRUM GROUP. ВСІ ПРАВА ЗАХИЩЕНІ.
            </p>
            <p className="text-xs text-[#777] font-mono tracking-wider font-bold">
              FORBES NEXT 250 · ISO CERTIFIED
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
