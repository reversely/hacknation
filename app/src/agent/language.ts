import type { LocalStore } from '../store/localStore';

// The language the agent and its fixed lines use with the operator. Kiswahili is the default:
// Noor reads and approves in Kiswahili (docs/architecture.md section 2). Kiswahili wording here
// needs review by a native speaker.
export type Language = 'sw' | 'en';

const LANGUAGE_KEY = 'operator_language';

export function readLanguage(store: LocalStore): Language {
  return store.getMeta(LANGUAGE_KEY) === 'en' ? 'en' : 'sw';
}

export function saveLanguage(store: LocalStore, language: Language): void {
  store.setMeta(LANGUAGE_KEY, language);
}

export const LANGUAGE_NAMES: Record<Language, string> = { sw: 'Kiswahili', en: 'English' };

export const TEXT = {
  sw: {
    awaitingApproval: 'Hili linahitaji idhini yako. Tafadhali kubali au kataa hapa chini.',
    stopped: 'Nimesimama baada ya hatua kadhaa. Tafadhali niambie niendelee vipi.',
    approvalNeeded: 'Idhini inahitajika',
    previewLoading: 'Ninaandaa ukurasa wako wa tovuti…',
    openWebsite: 'Fungua tovuti',
    draftChanged: 'Wasifu ulibadilika baada ya hakikisho. Tafadhali omba idhini tena.',
    previewFailed: 'Ukurasa haukuweza kuandaliwa',
    approve: 'Kubali',
    decline: 'Kataa',
    youApproved: 'Umekubali hili.',
    youDeclined: 'Umekataa hili.',
    placeholder: 'Mweleze msaidizi kuhusu ziara yako',
    send: 'Tuma',
    questions: {
      name: 'Biashara yako inaitwaje?',
      description: 'Ungeielezaje ziara yako kwa mgeni?',
      duration: 'Ziara inachukua muda gani?',
      price: 'Ziara inagharimu kiasi gani kwa kila mtu?',
      capacity: 'Wageni wangapi wanaweza kujiunga na ziara moja?',
      meeting_instructions: 'Wageni wanakutana nawe wapi?',
      availability: 'Ziara zinafanyika siku gani na saa ngapi?',
    },
    fields: {
      name: 'Jina la biashara',
      description: 'Maelezo',
      duration: 'Muda',
      price: 'Bei',
      capacity: 'Idadi ya wageni',
      meeting_instructions: 'Mahali pa kukutana',
      availability: 'Siku na saa',
      policies: 'Masharti',
    },
    saved: 'Nimehifadhi',
    whatsappMissing: 'Tafadhali weka namba yako ya WhatsApp kwenye Maandalizi kwanza.',
    websiteLive: 'Wasifu umeidhinishwa na tovuti yako iko hewani sasa.',
    websiteNeedsSetup: 'Wasifu umeidhinishwa. Jenga tovuti ya umma kwenye Maandalizi ili iwe mtandaoni.',
    websiteQueued: 'Wasifu umeidhinishwa. Tovuti itasasishwa mtandaoni Google ikiunganishwa.',
    stillNeeded: 'Bado inahitajika',
    nothingSaved: 'Bado sijahifadhi chochote kuhusu ziara yako.',
    draftIncomplete: 'Wasifu bado haujakamilika.',
    nextStep: 'Hatua inayofuata',
    allStepsDone: 'Hatua zote za maandalizi zimekamilika.',
    steps: {
      business: 'Maelezo ya biashara',
      gmail: 'Gmail',
      vercel: 'Vercel',
      website: 'Tovuti',
      sheets: 'Google Sheets',
      whatsapp: 'WhatsApp',
      calendar: 'Kalenda ya Google',
      listings: 'Matangazo ya Google na Facebook',
    },
  },
  en: {
    awaitingApproval: 'This needs your approval. Please approve or decline it below.',
    stopped: 'I stopped after several steps. Please tell me how to continue.',
    approvalNeeded: 'Approval needed',
    previewLoading: 'Preparing your website page…',
    openWebsite: 'Open website',
    draftChanged: 'The profile changed after the preview. Please ask for approval again.',
    previewFailed: 'The page could not be prepared',
    approve: 'Approve',
    decline: 'Decline',
    youApproved: 'You approved this.',
    youDeclined: 'You declined this.',
    placeholder: "Tell Noor's assistant about your tour",
    send: 'Send',
    questions: {
      name: 'What is your business called?',
      description: 'How would you describe the tour to a visitor?',
      duration: 'How long does the tour last?',
      price: 'What does the tour cost per person?',
      capacity: 'How many visitors can join one tour?',
      meeting_instructions: 'Where do visitors meet you?',
      availability: 'On which days and at what times do tours run?',
    },
    fields: {
      name: 'Business name',
      description: 'Description',
      duration: 'Duration',
      price: 'Price',
      capacity: 'Visitors per tour',
      meeting_instructions: 'Meeting place',
      availability: 'Days and times',
      policies: 'Policies',
    },
    saved: 'Saved',
    whatsappMissing: 'Please add your WhatsApp number in Setup first.',
    websiteLive: 'Your profile is approved and your website is live now.',
    websiteNeedsSetup: 'Your profile is approved. Build the public website in Setup to put it online.',
    websiteQueued: 'Your profile is approved. Your website updates online when Google syncs.',
    stillNeeded: 'Still needed',
    nothingSaved: 'Nothing is saved about your tour yet.',
    draftIncomplete: 'The profile is not complete yet.',
    nextStep: 'Next step',
    allStepsDone: 'All setup steps are done.',
    steps: {
      business: 'Business details',
      gmail: 'Gmail',
      vercel: 'Vercel',
      website: 'Website',
      sheets: 'Google Sheets',
      whatsapp: 'WhatsApp',
      calendar: 'Google Calendar',
      listings: 'Google and Facebook listings',
    },
  },
} as const;
