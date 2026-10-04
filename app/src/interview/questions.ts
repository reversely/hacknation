// The onboarding interview's questions (docs/interview.md, from the wireframe's "fill in info"
// sections 1 to 4). Wren speaks the Kiswahili line; `en` is what the extraction model reads.
// Kiswahili wording needs review by a native speaker.

export type Kind = 'text' | 'service_type' | 'minutes' | 'kes' | 'count' | 'schedule' | 'yes_no' | 'phone' | 'email' | 'photos' | 'confirm';

export type Question = { key: string; kind: Kind; sw: string; en: string; clarify: string; optional?: boolean };

export const BUSINESS: Question[] = [
  { key: 'name', kind: 'text', sw: 'Biashara yako inaitwa nani?', en: 'What is the name of your business?', clarify: 'Samahani, sikusikia jina. Biashara yako inaitwa nani?' },
  { key: 'address', kind: 'text', sw: 'Biashara yako iko wapi?', en: 'Where is your business located?', clarify: 'Biashara iko mji au kijiji gani?' },
];

export function serviceQuestions(n: number): Question[] {
  const s = `service_${n}`;
  return [
    { key: `${s}.type`, kind: 'service_type', sw: n === 1 ? 'Unatoa huduma gani: ziara, huduma binafsi, warsha, au nyingine?' : 'Huduma hii ni ya aina gani: ziara, huduma binafsi, warsha, au nyingine?', en: 'What kind of service is it: a tour, a personal service, a workshop, or other?', clarify: 'Ni ziara, huduma binafsi, warsha, au nyingine?' },
    { key: `${s}.description`, kind: 'text', sw: 'Ungeielezaje huduma hii kwa mgeni?', en: 'How would you describe this service to a visitor?', clarify: 'Tafadhali eleza kwa sentensi moja wageni wanafanya nini.' },
    { key: `${s}.duration`, kind: 'minutes', sw: 'Inachukua muda gani?', en: 'How long does it take?', clarify: 'Ni saa ngapi au dakika ngapi?' },
    { key: `${s}.price`, kind: 'kes', sw: 'Inagharimu kiasi gani kwa kila mtu?', en: 'How much does it cost per person?', clarify: 'Ni shilingi ngapi kwa mtu mmoja?' },
    { key: `${s}.capacity`, kind: 'count', sw: 'Wageni wangapi wanaweza kujiunga kwa wakati mmoja?', en: 'How many visitors can join at one time?', clarify: 'Ni watu wangapi zaidi?' },
    { key: `${s}.availability`, kind: 'schedule', sw: 'Inafanyika siku gani na saa ngapi?', en: 'On which days and at what time does it run?', clarify: 'Inaanza saa ngapi hasa?' },
    { key: `${s}.instructions`, kind: 'text', sw: 'Wageni wakutane nawe wapi, au wafanye nini wakifika?', en: 'Where do visitors meet you, or what should they do when they arrive?', clarify: 'Wageni wakutane wapi?' },
  ];
}

export const MORE_SERVICES: Question = { key: 'more_services', kind: 'yes_no', sw: 'Je, una huduma nyingine?', en: 'Do you offer another service?', clarify: 'Ndiyo au hapana: una huduma nyingine?' };

export const CONTACT: Question[] = [
  { key: 'contact.phone', kind: 'phone', sw: 'Wageni wakupigie au wakutumie WhatsApp kwa namba gani?', en: 'Which phone or WhatsApp number should visitors use?', clarify: 'Tafadhali sema namba tarakimu moja moja.' },
  { key: 'contact.email', kind: 'email', sw: 'Una barua pepe ya biashara?', en: 'Do you have a business email address?', clarify: 'Barua pepe ni ipi?', optional: true },
  { key: 'photos', kind: 'photos', sw: 'Ungependa kuongeza picha za shamba sasa?', en: 'Would you like to add photos of the farm now?', clarify: 'Ndiyo au hapana?', optional: true },
];

export const CONFIRM: Question = { key: 'confirm', kind: 'confirm', sw: 'Nimeandika haya. Je, ni sahihi?', en: 'This is what I wrote down. Is it correct?', clarify: 'Ni sahihi, au nibadilishe nini?' };

export const MAX_SERVICES = 3;
