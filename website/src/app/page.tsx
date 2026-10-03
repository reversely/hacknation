import { getPublicProfile, whatsappLink } from '@/lib/profile';

export const dynamic = 'force-dynamic';

const shillings = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });

export default async function Home() {
  const farm = await getPublicProfile();
  if (!farm) {
    return <main style={{ width: 'min(720px, calc(100% - 40px))', margin: '18vh auto' }}><span className="brand-mark">N</span><p className="eyebrow" style={{ marginTop: 32 }}>WEBSITE SETUP</p><h1>Your farm story<br /><em>is on its way.</em></h1><p>Visit again soon to plan a day at the farm.</p></main>;
  }
  const firstOffering = farm.offerings[0];
  const message = `Hello ${farm.name}, I would like to ask about a farm visit.`;

  return (
    <main>
      <nav className="nav wrap" aria-label="Main navigation">
        <a className="brand" href="#home"><span className="brand-mark">N</span>{farm.name}</a>
        <a className="nav-link" href="#visit">Plan your visit <span aria-hidden="true">↗</span></a>
      </nav>
      <section className="hero wrap" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span className="sun-dot" /> A little closer to the land</p>
          <h1>Slow down.<br /><em>Come outside.</em></h1>
          <p className="intro">{farm.description.en}</p>
          <div className="hero-actions">
            <a className="button button-dark" href={whatsappLink(farm.whatsapp_number, message)} target="_blank" rel="noreferrer">Book on WhatsApp <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#visit">Explore the visit <span aria-hidden="true">↓</span></a>
          </div>
          <div className="trust-note"><span className="avatar-stack"><i>☀</i><i>✿</i><i>↟</i></span><span>A family farm, shared with care</span></div>
        </div>
        <div className="hero-art" role="img" aria-label="Illustration of a sunny farm landscape">
          <div className="sun" />
          <div className="cloud cloud-one" /><div className="cloud cloud-two" />
          <div className="hill hill-back" /><div className="hill hill-mid" /><div className="hill hill-front" />
          <div className="farmhouse"><div className="roof" /><div className="house-body"><span /><span /></div></div>
          <div className="tree tree-one"><i /><b /></div><div className="tree tree-two"><i /><b /></div>
          <div className="art-caption"><span>01 / 03</span><span>Nyeri County, Kenya</span></div>
          <div className="art-sticker">Made for<br /><b>good days</b><span>✳</span></div>
        </div>
      </section>
      <section className="marquee" aria-label="Experience the farm"><div>GOOD FOOD <i>✳</i> OPEN AIR <i>✳</i> FARM FRIENDS <i>✳</i> SLOW MORNINGS <i>✳</i> GOOD FOOD <i>✳</i> OPEN AIR <i>✳</i></div></section>
      <section className="visit wrap" id="visit">
        <div className="section-heading"><p className="eyebrow">THE FARM EXPERIENCE</p><h2>A day well <em>spent.</em></h2></div>
        <div className="visit-grid">
          <div className="visit-note"><span className="note-number">01</span><p>Trade the rush for fresh air, friendly faces and a glimpse into everyday farm life.</p><a href={whatsappLink(farm.whatsapp_number, message)} target="_blank" rel="noreferrer" className="arrow-link">Ask Noor a question <span>↗</span></a></div>
          {farm.offerings.map((offering, index) => (
            <article className="offering-card" key={offering.id}>
              <div className="card-top"><span className="card-index">0{index + 1} / VISIT</span><span className="leaf-mark">✳</span></div>
              <h3>{offering.name.en}</h3><p>{offering.description.en}</p>
              <div className="card-meta"><span>{offering.duration_minutes / 60} hours</span><span>Up to {offering.capacity} guests</span></div>
              <div className="card-bottom"><strong>{shillings.format(offering.price.amount)}<small> / person</small></strong><a aria-label={`Ask about ${offering.name.en}`} href={whatsappLink(farm.whatsapp_number, `Hello ${farm.name}, I would like to ask about ${offering.name.en}.`)} target="_blank" rel="noreferrer">↗</a></div>
            </article>
          ))}
        </div>
      </section>
      <section className="swahili-band"><div className="wrap swahili-inner"><span className="swahili-flower">✳</span><p lang="sw">{farm.description.sw}</p><a href={whatsappLink(farm.whatsapp_number, `Habari ${farm.name}, ningependa kujua kuhusu ziara ya shamba.`)} target="_blank" rel="noreferrer">Karibu — tuzungumze <span>↗</span></a></div></section>
      <footer className="footer wrap"><a className="brand" href="#home"><span className="brand-mark">N</span>{farm.name}</a><span>Made with care in the Kenyan highlands</span><a href={whatsappLink(farm.whatsapp_number, message)} target="_blank" rel="noreferrer">Say hello <span>↗</span></a></footer>
    </main>
  );
}
