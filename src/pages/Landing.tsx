import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, ChartNoAxesCombined, Check, Lightbulb, Menu, MessagesSquare, ScanLine, X } from 'lucide-react'
import { Brand } from '../components/Brand'
import './landing.css'

const features = [
  { icon: ScanLine, title: 'AI Invoice Extraction', text: 'Upload supplier invoices and extract ingredients, quantities, and prices with AI. Review the results before confirming.' },
  { icon: ChartNoAxesCombined, title: 'Ingredient Price Tracking', text: 'Compare normalized ingredient prices over time and identify significant cost changes.' },
  { icon: Lightbulb, title: 'AI Business Insights', text: 'Understand purchasing patterns, cost risks, and potential savings opportunities using your invoice history.' },
  { icon: MessagesSquare, title: 'AI Purchasing Assistant', text: "Ask questions about your restaurant’s purchasing records and receive data-grounded recommendations." },
]

const steps = [
  ['Upload', 'Upload a supplier invoice in PDF or supported image format.'],
  ['Review', 'Let AI extract the invoice details, then review and confirm the results.'],
  ['Track', 'Build your purchasing history and monitor ingredient price changes.'],
  ['Decide', 'Use AI-powered insights to support better purchasing decisions.'],
]

const title = 'InvoiceEye — Less paperwork. Smarter purchasing.'

function DashboardPreview() {
  return (
    <div className="landing-preview" aria-label="Dashboard preview with synthetic sample data">
      <div className="landing-preview-head"><strong>Purchasing overview</strong><span>Sample data</span></div>
      <p className="landing-metric-label">Monthly purchasing expenditure</p>
      <strong className="landing-metric">CA$12,455.09</strong>
      <div className="landing-chart" role="img" aria-label="Sample expenditure trend rising from June to November">
        <svg viewBox="0 0 480 152" preserveAspectRatio="none" aria-hidden="true">
          <path className="landing-gridlines" d="M0 20H480 M0 60H480 M0 100H480 M0 140H480" />
          <path className="landing-area" d="M0 113 C34 109 67 78 96 86 S157 114 192 95 S250 45 288 54 S354 83 384 62 S440 28 480 20 V152 H0Z" />
          <path className="landing-series" d="M0 113 C34 109 67 78 96 86 S157 114 192 95 S250 45 288 54 S354 83 384 62 S440 28 480 20" />
        </svg>
        <div className="landing-months">{['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map(month => <span key={month}>{month}</span>)}</div>
      </div>
      <div className="landing-alert"><span>INGREDIENT PRICE ALERT</span><strong>Roma tomatoes <b>+18.0%</b></strong></div>
      <div className="landing-insight"><Lightbulb size={19} aria-hidden="true" /><div><strong>AI insight</strong><p>Review the latest tomato price against prior purchases before your next order.</p></div></div>
    </div>
  )
}

export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    document.title = title
  }, [])

  return (
    <div className="landing" id="top">
      <header className="landing-header" onKeyDown={event => {
        if (menuOpen && event.key === 'Escape') {
          setMenuOpen(false)
          menuTrigger.current?.focus()
        }
      }}>
        <div className="landing-wrap landing-nav-row">
          <a href="#top" aria-label="InvoiceEye home"><Brand /></a>
          <button ref={menuTrigger} className="landing-menu" type="button" aria-expanded={menuOpen} aria-controls="landing-nav"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav id="landing-nav" aria-label="Main navigation" className={menuOpen ? 'is-open' : ''}>
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <Link to="/login">Log in</Link>
            <Link className="landing-button" to="/signup">Get started <ArrowRight size={16} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>
      <main className="landing-main">
        <section className="landing-wrap landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker">Intelligent restaurant purchasing</p>
            <h1>Less paperwork.<br /><span>Smarter purchasing.</span></h1>
            <p>Turn everyday supplier invoices into actionable insights. Track ingredient prices, understand purchasing costs, and make smarter business decisions with AI.</p>
            <div className="landing-actions">
              <Link className="landing-button" to="/signup">Get started <ArrowRight size={18} aria-hidden="true" /></Link>
              <a className="landing-button landing-outline" href="#features">Explore features <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
          </div>
          <DashboardPreview />
        </section>

        <section className="landing-section landing-features" id="features">
          <div className="landing-wrap">
            <h2>From invoices to insights.</h2>
            <div className="landing-feature-grid">
              {features.map(({ icon: FeatureIcon, title: name, text }) => (
                <article key={name}>
                  <span className="landing-feature-icon"><FeatureIcon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                  <h3>{name}</h3><p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-showcase">
          <div className="landing-wrap">
            <h2>See your purchasing costs more clearly.</h2>
            <figure>
              <img src="/marketing/dashboard.webp" width={1214} height={682} alt="InvoiceEye dashboard showing confirmed purchases, spending trends and price increases from synthetic invoices" loading="lazy" />
              <figcaption><Check size={16} aria-hidden="true" /> InvoiceEye dashboard with synthetic demonstration data</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-section landing-workflow" id="how-it-works">
          <div className="landing-wrap">
            <h2>Smarter purchasing in four simple steps.</h2>
            <ol>{steps.map(([name, text], index) => (
              <li key={name}><span aria-hidden="true">0{index + 1}</span><h3>{name}</h3><p>{text}</p></li>
            ))}</ol>
          </div>
        </section>

        <section className="landing-final">
          <div className="landing-wrap">
            <h2>Make every invoice count.</h2>
            <p>Spend less time managing paperwork and more time making informed purchasing decisions.</p>
            <Link className="landing-button" to="/signup">Get started with InvoiceEye <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link className="landing-login" to="/login">Already have an account? Log in.</Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-wrap">
          <div><a href="#top" aria-label="InvoiceEye home"><Brand dark /></a><p>Less paperwork. Smarter purchasing.</p></div>
          <nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><Link to="/login">Log in</Link></nav>
          <small>© {new Date().getFullYear()} InvoiceEye</small>
        </div>
      </footer>
    </div>
  )
}
