/**
 * NEXUS AI — Launch Operations System
 * Email sequences · PH launch kit · Social calendar
 * Analytics tracker · Network activation CRM
 */

// ══════════════════════════════════════════════════
// 1. EMAIL SEQUENCES — Full onboarding funnel
// ══════════════════════════════════════════════════

export const EMAIL_SEQUENCES = {

  // Welcome series (triggered on signup)
  welcome: [
    {
      id: 'welcome-1',
      delay: 0, // Immediate
      subject: 'Welcome to NEXUS AI — your first 5 minutes',
      preheader: 'You\'re officially in. Here\'s how to get your AHA moment fast.',
      body: `
Hey {{firstName}},

You just joined {{totalUsers}} builders who decided to stop juggling AI tools.

Smart move.

Here's what I want you to do in the next 5 minutes:

**1. Set up your first automation (2 min)**
Go to nexus.ai/automations → click "New" → type in plain English what you want.
Try: "Every morning at 9am, summarize my unread emails and send them to Slack."

**2. Ask NEXUS something you'd normally Google (1 min)**
It searches the web, remembers your context, and gets smarter with every answer.

**3. Connect one integration (2 min)**
Gmail, Slack, or Notion — takes 30 seconds each.

That's it. Most users have their first "wait, this actually works" moment within the first 5 minutes.

If you hit any friction, hit reply. I read every email.

— The NEXUS team

P.S. You're on the Free plan. If you want unlimited automations and agent mode, upgrade anytime at nexus.ai/upgrade — but explore first.
      `,
      cta: { text: 'Open NEXUS', url: 'https://app.nexus.ai' },
    },

    {
      id: 'welcome-2',
      delay: 2, // days
      subject: 'The one NEXUS feature that changes everything',
      preheader: 'Most people miss this on day one.',
      body: `
Hey {{firstName}},

Quick check: have you tried Agent Mode yet?

It's the feature that makes NEXUS different from every other AI tool.

**What regular AI does:**
You ask → it answers → you copy-paste the answer somewhere → you manually do the next step.

**What NEXUS Agent Mode does:**
You give it a goal → it plans → it executes → it reports back with results.

Real example:
> "Research our top 3 competitors, find their pricing, and save a summary to my Notion."

NEXUS will: search the web → read competitor pages → extract pricing → open your Notion → create a formatted table → notify you when done.

You do: nothing.

Try it at nexus.ai → click "Agent Mode" → give it a real task from your to-do list.

What task will you delegate first?

— NEXUS team
      `,
      cta: { text: 'Try Agent Mode', url: 'https://app.nexus.ai?mode=agent' },
    },

    {
      id: 'welcome-3',
      delay: 5,
      subject: '{{firstName}}, you\'ve been with us 5 days',
      preheader: 'Here\'s what power users do differently.',
      body: `
Hey {{firstName}},

5 days in. Here's what the top 10% of NEXUS users do that others don't:

**They automate before they're "ready."**
Don't wait until you understand the platform perfectly. Just tell NEXUS what repeats in your week and let it handle it.

**They treat memory like a second brain.**
Every important decision, preference, or fact — they tell NEXUS to remember it.
"Remember: I prefer bullet-point summaries over paragraphs."
"Remember: my client Acme Corp is sensitive about pricing discussions."

**They check the integrations panel.**
Most users have 3+ tools they haven't connected yet. Each one unlocks new automation possibilities.

Your current stats:
- Automations created: {{automationCount}}
- Messages sent: {{messageCount}}
- Time saved estimate: {{timeSaved}} hours

What's one thing in your workflow NEXUS isn't handling yet? Reply and tell me — I might have a template for it.

— NEXUS team
      `,
      cta: { text: 'See Your Stats', url: 'https://app.nexus.ai/analytics' },
    },

    {
      id: 'welcome-4',
      delay: 10,
      subject: 'Free plan limits hit? Here\'s the honest answer.',
      preheader: 'No pressure, just facts.',
      body: `
Hey {{firstName}},

If you've been using NEXUS and started hitting the Free plan limits — good. It means it's working.

Here's the honest breakdown:

**Free plan is for:** Trying NEXUS, building 1 automation, testing the waters.
**Pro ($19/mo) is for:** Daily users who want unlimited interactions + 10 automations + all modes.
**Power ($49/mo) is for:** Teams and power users who need everything unlimited.

If you're averaging more than 2-3 NEXUS sessions per week, Pro pays for itself in the first 3 days.

Here's the math our users share:
- Average tools replaced: 4.2
- Average cost of those tools: $87/mo
- NEXUS Pro: $19/mo
- Monthly saving: $68

If the numbers make sense, upgrade at nexus.ai/upgrade.
If they don't, stay Free — genuinely, it's fine.

Either way, you're here. That's the important part.

— NEXUS team
      `,
      cta: { text: 'See Plans', url: 'https://nexus.ai/pricing' },
    },
  ],

  // Re-engagement series (inactive 7+ days)
  reengagement: [
    {
      id: 'reeng-1',
      delay: 7,
      subject: 'Did NEXUS let you down?',
      preheader: 'Honest question. Honest answer wanted.',
      body: `
Hey {{firstName}},

You signed up {{daysSinceSignup}} days ago and I noticed you haven't been back.

That's on us, not you.

Either we didn't explain the value clearly, or you hit a friction point we should fix.

One question: What stopped you from using NEXUS?

A) Couldn't figure out how to get started
B) Tried it but it didn't work as expected
C) Got busy, haven't had time
D) Found something better (tell me what!)
E) Something else

Just reply with the letter. Or if you want to give more detail, I'll actually read it.

If you want to give it another shot, here's a fresh start: nexus.ai/quick-start

— {{senderName}}
P.S. We shipped 3 major updates since you signed up. Might be worth another look.
      `,
      cta: { text: 'Try NEXUS Again', url: 'https://app.nexus.ai' },
    },
  ],

  // Upgrade nurture (Free users, active 14+ days)
  upgrade: [
    {
      id: 'upgrade-1',
      delay: 14,
      subject: 'You\'ve used NEXUS {{sessionCount}} times. Here\'s what unlocks next.',
      preheader: 'You\'ve hit the ceiling of Free. Here\'s what\'s beyond it.',
      body: `
Hey {{firstName}},

You've logged in {{sessionCount}} times in {{daysSinceSignup}} days.

That tells me NEXUS is working for you. And that means you're running into the Free plan ceiling.

Here's what unlocks the moment you go Pro:

✓ **Unlimited AI interactions** — no more "limit reached" messages
✓ **10 full automation workflows** — not just 1
✓ **Agent Mode** — the feature that does the work for you
✓ **5 integrations** — Gmail, Slack, Notion, GitHub, Stripe
✓ **30-day persistent memory** — NEXUS remembers everything

For {{currentPlanCost}}/month more than you're paying now, that's the Pro plan.

Special offer for active Free users: use code POWER14 at checkout for 20% off your first 3 months.

Offer expires in 72 hours.

— NEXUS team
      `,
      cta: { text: 'Upgrade to Pro — 20% off', url: 'https://nexus.ai/upgrade?code=POWER14' },
    },
  ],
};

// ══════════════════════════════════════════════════
// 2. PRODUCT HUNT LAUNCH KIT
// ══════════════════════════════════════════════════

export const PRODUCT_HUNT_KIT = {
  launchDay: 'Tuesday', // Best day: Tuesday or Wednesday
  launchTime: '00:01 PST',

  listing: {
    name: 'NEXUS AI',
    tagline: 'One platform for AI chat, agents, automation, and your personal OS',
    topics: ['Artificial Intelligence', 'Productivity', 'No-Code', 'SaaS', 'Automation'],

    description: `
**We built NEXUS because we were drowning in AI tools.**

ChatGPT for chat. Claude for reasoning. Zapier for automation. Notion AI for notes. Copy.ai for writing. 14 tabs, 14 logins, 14 bills — and none of them talk to each other.

NEXUS is the answer.

**What NEXUS does:**
🤖 **AI Agent** — Give it a goal, walk away. It plans, executes, and delivers.
💬 **Universal Assistant** — Persistent memory. Gets smarter every conversation.
⚡ **Automation Hub** — "Every Monday, email me a competitor summary." Done.
🖥 **Personal OS** — Manages your calendar, emails, and tasks proactively.

**The numbers:**
• Replaces 4-8 other tools on average
• Users save $68-$290/month
• 247+ automations running every day
• 1,284 early users and growing

**Free to start. Honest pricing. No dark patterns.**

We're two founders who were tired of building with duct tape. If you've felt the same, NEXUS is for you.

Ask us anything — we'll be here all day.
    `,

    media: {
      thumbnail: 'nexus-ph-thumbnail.png',
      gallery: ['hero-screenshot.png', 'agent-demo.gif', 'automation-builder.png', 'memory-panel.png'],
      video: 'https://www.youtube.com/watch?v=NEXUS_DEMO',
    },

    makers: [
      { name: 'Kurucu', role: 'Co-Founder & CEO', twitter: '@nexus_ai' },
    ],
  },

  // Maker comment (posted when product goes live)
  makerComment: `
Hey PH! 👋

Excited to finally share NEXUS with this community.

The short version: we got sick of paying for 8 AI tools that don't talk to each other. So we built one that does everything.

**The honest pitch:**
NEXUS isn't "AI tool #847." It's the integration layer that replaces all of them. The part that makes everything work together.

**Why today is special:**
We're launching the agent system publicly for the first time. Tell it what to accomplish, and it figures out how — searching the web, running code, sending emails, updating your tools. All autonomously.

**What would help us most:**
1. Try the free plan — no card needed
2. If it saves you time, upvote 🙏
3. Comment with your use case — we'll build a template for the most popular ones

We'll be here all day answering questions. No question too basic, no feedback too harsh.

Go build something good. 🚀
  `,

  // Pre-launch outreach messages (DM to supporters)
  prelaunchDM: `
Hey [NAME],

Launching NEXUS AI on Product Hunt this [DAY] — the unified AI platform that replaces ChatGPT, Zapier, Notion AI, and 5 other tools in one.

If you've felt the "too many AI tools" pain, this is the answer.

Would mean a lot if you could upvote when we go live at 00:01 PST [DATE]:
→ producthunt.com/posts/nexus-ai

I'll personally make sure you get 3 months of Pro free if you support. 🙏

Quick link to bookmark: [PH_URL]
  `,

  // Post-launch thank you
  postLaunchTweet: `
🚀 NEXUS AI just launched on @ProductHunt!

We hit #2 Product of the Day in the first 4 hours.

To everyone who upvoted, commented, tried the product — thank you.

This is day one. Here's what's coming next ↓

→ [PH_URL]
  `,
};

// ══════════════════════════════════════════════════
// 3. SOCIAL MEDIA CONTENT CALENDAR — 30 days
// ══════════════════════════════════════════════════

export const SOCIAL_CALENDAR = {
  platforms: ['twitter', 'linkedin'],
  cadence: { twitter: 3, linkedin: 1 }, // posts per day / per week

  week1: [
    {
      day: 1, platform: 'twitter', type: 'build-in-public',
      content: `I cancelled $312/month of AI tool subscriptions last week.

ChatGPT Plus ❌
Claude Pro ❌
Zapier ❌
Notion AI ❌
Copy.ai ❌

Replaced with 1 platform at $19/mo.

Here's what that platform can actually do 🧵`,
      hashtags: ['buildinpublic', 'AI', 'productivity'],
      hook: 'Bold statement → credibility → thread promise',
    },
    {
      day: 1, platform: 'twitter', type: 'demo',
      content: `This is NEXUS AI Agent Mode.

You type: "Research our top 3 competitors, extract their pricing, and add it to Notion."

It:
→ Searches the web
→ Reads competitor pages
→ Extracts pricing data
→ Opens your Notion
→ Creates a formatted table
→ Notifies you when done

You do: nothing.

[DEMO VIDEO]`,
      hashtags: ['AI', 'automation', 'ProductivityHack'],
    },
    {
      day: 2, platform: 'twitter', type: 'social-proof',
      content: `"Set up 1 automation on Monday.

By Friday it had:
• Summarized 147 emails
• Posted 4 Slack updates
• Updated my CRM 23 times
• Sent 2 weekly reports

Zero manual work."

— @user_testimonial

This is what happens when you stop context-switching and start automating.`,
      hashtags: ['nexusai', 'AI'],
    },
    {
      day: 3, platform: 'linkedin', type: 'thought-leadership',
      content: `The AI tool stack problem is getting worse, not better.

The average knowledge worker now uses 7+ AI tools. Each tool requires:
→ A separate login
→ A separate prompt strategy
→ A separate monthly payment
→ Manual copy-pasting between them

The dirty secret: these tools don't talk to each other because the companies building them don't want them to. Fragmentation is profitable.

The solution isn't a better individual tool. It's a unified layer that connects them all — with a single memory, a single interface, and a single monthly bill.

That's what we're building with NEXUS AI.

If you've felt this fragmentation pain, I'd love to hear what it costs you in time per week. Drop it in the comments.`,
      hashtags: ['AI', 'Productivity', 'FutureOfWork'],
    },
    {
      day: 5, platform: 'twitter', type: 'product-hunt-teaser',
      content: `Something big is launching Tuesday.

If you've ever:
• Had too many AI tools open at once
• Wished they could talk to each other
• Wanted one place to automate everything

You'll want to see this.

Setting your alarm for 00:01 PST? 

→ [PH_NOTIFY_LINK]`,
      hashtags: ['ProductHunt', 'AI'],
    },
    {
      day: 7, platform: 'twitter', type: 'launch',
      content: `WE'RE LIVE ON @ProductHunt 🚀

NEXUS AI — One platform. Every intelligence.

The AI tool that replaces all your AI tools.

✓ Agent mode (autonomous task execution)
✓ Persistent memory
✓ 50+ integrations
✓ Built-in automation
✓ Free to start

Would mean everything if you'd upvote 🙏

→ [PH_URL]`,
    },
  ],

  // Ongoing content themes
  contentThemes: [
    { name: 'Build in public', frequency: '3x/week', format: 'Behind-the-scenes, metrics, decisions' },
    { name: 'AI tips', frequency: '2x/week', format: 'One actionable tip per post' },
    { name: 'User wins', frequency: '2x/week', format: 'Real results from real users' },
    { name: 'Product demos', frequency: '1x/week', format: 'Short video showing a feature' },
    { name: 'Thought leadership', frequency: '1x/week on LinkedIn', format: 'Industry insight, 500-800 words' },
    { name: 'Memes/fun', frequency: '1x/week', format: 'Relatable AI humor, light touch' },
  ],
};

// ══════════════════════════════════════════════════
// 4. LAUNCH DAY OPERATIONS — Minute-by-minute plan
// ══════════════════════════════════════════════════

export const LAUNCH_DAY_PLAN = {
  date: 'TBD — next Tuesday',

  timeline: [
    { time: '00:01 PST', action: 'Product Hunt listing goes live', owner: 'Automated', priority: 'critical' },
    { time: '00:05',     action: 'Post maker comment on PH listing', owner: 'Kurucu', priority: 'critical' },
    { time: '00:10',     action: 'First tweet: "We\'re live on PH!"', owner: 'Social', priority: 'high' },
    { time: '00:15',     action: 'DM first wave: 50 PH supporters with link', owner: 'Kurucu', priority: 'critical' },
    { time: '06:00',     action: 'US East Coast wakes up — DM second wave', owner: 'Kurucu', priority: 'high' },
    { time: '07:00',     action: 'LinkedIn post goes live', owner: 'Social', priority: 'high' },
    { time: '08:00',     action: 'Check #1/#2 position — adjust strategy', owner: 'Kurucu', priority: 'high' },
    { time: '09:00',     action: 'Tweet with demo video', owner: 'Social', priority: 'high' },
    { time: '10:00',     action: 'DM Hacker News community', owner: 'Kurucu', priority: 'medium' },
    { time: '12:00',     action: 'Midday update tweet with user count', owner: 'Social', priority: 'medium' },
    { time: '14:00',     action: 'Comment on every PH comment personally', owner: 'Kurucu', priority: 'critical' },
    { time: '16:00',     action: 'US West Coast afternoon push', owner: 'Social', priority: 'medium' },
    { time: '20:00',     action: 'Evening wrap-up tweet with day stats', owner: 'Social', priority: 'medium' },
    { time: '23:59',     action: 'Final push tweet before midnight', owner: 'Social', priority: 'low' },
  ],

  metrics: {
    upvoteTargets: { good: 200, great: 400, exceptional: 700 },
    signupTargets:  { good: 50,  great: 150, exceptional: 400 },
    positionTarget: 'Top 3 Product of the Day',
  },

  contingencies: {
    'Below 100 upvotes by noon':    'Activate second outreach wave, post in 3 relevant communities',
    'Server overload':              'Scale K8s pods immediately (auto-HPA should handle, monitor)',
    'Negative PH comment':          'Respond within 5 min, address directly, never defensive',
    'Bug reported by many users':   'Acknowledge publicly, hotfix deploy within 1 hour',
    'Competitor attacks':           'Ignore publicly, note privately for positioning update',
  },
};

// ══════════════════════════════════════════════════
// 5. NETWORK ACTIVATION CRM
// ══════════════════════════════════════════════════

export const NETWORK_CRM = {
  segments: [
    {
      id: 'tier1-tech',
      name: 'Tech founders & CTOs',
      size: 200,
      platform: 'LinkedIn + Twitter',
      message: `Hey [NAME],

Launching NEXUS AI next week — a unified AI platform that replaces ChatGPT, Zapier, Notion AI, and 5 other tools.

Given your tech background, I think you'd find the agent architecture interesting. It does autonomous multi-step task execution with tool-use — kind of like what you'd build internally, but ready in 5 minutes.

Free to try at nexus.ai — no card needed.

Would love your feedback if you get 10 minutes.`,
      expectedResponseRate: '35-45%',
    },

    {
      id: 'tier1-founders',
      name: 'Startup founders (seed-Series B)',
      size: 80,
      platform: 'LinkedIn',
      message: `Hey [NAME],

Working on something I think you'll appreciate — NEXUS AI, a single platform that combines AI chat, autonomous agents, and workflow automation.

The pitch for founders: it replaces 4-6 SaaS tools with one $19/month subscription. Our early users average $68/month in savings.

Would love to give you early access before the public launch — no card, no commitment.

Link: nexus.ai/early-access`,
      expectedResponseRate: '25-35%',
    },

    {
      id: 'tier2-pm',
      name: 'Product managers & operators',
      size: 120,
      platform: 'LinkedIn',
      message: `Hey [NAME],

Quick one — launching NEXUS AI, a unified AI platform for people who do a lot with a little.

If you're using multiple AI tools and tired of them not talking to each other, NEXUS solves that. One platform, persistent memory, automated workflows, 50+ integrations.

Free plan available. Would love your feedback.

→ nexus.ai`,
      expectedResponseRate: '20-30%',
    },
  ],

  trackingTemplate: {
    fields: ['name', 'platform', 'segment', 'messageSent', 'responded', 'signedUp', 'upgraded', 'notes'],
    automationNote: 'Track in Airtable or Notion — import this schema',
  },
};

// ══════════════════════════════════════════════════
// 6. ANALYTICS — What to measure and when
// ══════════════════════════════════════════════════

export const ANALYTICS_FRAMEWORK = {

  // North Star Metric
  northStar: {
    metric: 'Weekly Active Users (WAU)',
    target90d: 500,
    rationale: 'Measures real value delivery — not just signups',
  },

  // Weekly dashboard
  weeklyDashboard: [
    { metric: 'New signups',            target: { w1: 100, w4: 250, w12: 500 }, alert: 'below 50% of target' },
    { metric: 'WAU / total users',      target: '40%+', alert: 'below 30%' },
    { metric: 'Free → Pro conversion',  target: '8-12%', alert: 'below 5%' },
    { metric: 'Day 7 retention',        target: '30%+', alert: 'below 20%' },
    { metric: 'Day 30 retention',       target: '20%+', alert: 'below 12%' },
    { metric: 'Automations created/user', target: '2.5+', alert: 'below 1.5' },
    { metric: 'MRR',                    target: { w4: '$2K', w12: '$10K' }, alert: 'below 60% of target' },
    { metric: 'Monthly churn',          target: '<5%', alert: 'above 7%' },
    { metric: 'NPS',                    target: '50+', alert: 'below 30' },
    { metric: 'p95 API latency',        target: '<500ms', alert: 'above 800ms' },
  ],

  // Event taxonomy
  events: [
    'user.signed_up', 'user.verified_email', 'user.first_message',
    'user.aha_moment',           // = first automation OR first agent task
    'user.connected_integration',
    'user.created_automation',
    'user.upgraded_to_pro',
    'user.upgraded_to_power',
    'user.invited_teammate',
    'user.shared_output',        // viral trigger
    'user.churned',
  ],

  // Funnel stages
  funnel: [
    { stage: 'Visitor',       benchmark: '100%' },
    { stage: 'Signup',        benchmark: '5-8%', leakageReason: 'Value prop unclear' },
    { stage: 'Verified',      benchmark: '70%',  leakageReason: 'Email deliverability' },
    { stage: 'AHA moment',    benchmark: '45%',  leakageReason: 'Onboarding friction' },
    { stage: 'Retained (D7)', benchmark: '30%',  leakageReason: 'Habit not formed' },
    { stage: 'Upgraded',      benchmark: '10%',  leakageReason: 'Price / feature gap' },
    { stage: 'Retained (M3)', benchmark: '60%',  leakageReason: 'Churn / competitor' },
  ],

  // Tools setup
  tools: [
    { name: 'PostHog',     purpose: 'Product analytics, funnels, session recordings', priority: 'critical' },
    { name: 'Mixpanel',    purpose: 'Event tracking backup + cohort analysis', priority: 'high' },
    { name: 'Stripe',      purpose: 'Revenue analytics, MRR, churn', priority: 'critical' },
    { name: 'Customer.io', purpose: 'Email automation (uses event data)', priority: 'high' },
    { name: 'Hotjar',      purpose: 'Heatmaps on landing page', priority: 'medium' },
    { name: 'Sentry',      purpose: 'Error tracking, performance', priority: 'critical' },
    { name: 'Datadog',     purpose: 'Infrastructure monitoring', priority: 'high' },
  ],
};

// ══════════════════════════════════════════════════
// 7. LAUNCH CHECKLIST — 70-point pre-launch audit
// ══════════════════════════════════════════════════

export const LAUNCH_CHECKLIST = {
  categories: [
    {
      name: 'Product',
      items: [
        { item: 'Core user flow tested end-to-end', critical: true },
        { item: 'Signup → AHA moment < 5 minutes verified', critical: true },
        { item: 'Email verification working', critical: true },
        { item: 'Password reset working', critical: true },
        { item: 'Mobile responsive (test on iPhone + Android)', critical: true },
        { item: 'Error states handled gracefully (not blank screens)', critical: true },
        { item: 'Rate limiting tested (free plan limits trigger correctly)', critical: false },
        { item: 'Agent mode tested with 5 different task types', critical: true },
        { item: 'All 8 integrations tested (OAuth flow works)', critical: false },
        { item: 'Memory system persists between sessions', critical: true },
      ],
    },
    {
      name: 'Infrastructure',
      items: [
        { item: 'Load tested for 500 concurrent users', critical: true },
        { item: 'Database backups automated and tested restore', critical: true },
        { item: 'Uptime monitoring active (PagerDuty/similar)', critical: true },
        { item: 'SSL certificates valid for 90+ days', critical: true },
        { item: 'CDN configured for static assets', critical: false },
        { item: 'Auto-scaling tested (K8s HPA verified)', critical: true },
        { item: 'Redis persistence configured (no data loss on restart)', critical: true },
        { item: 'API rate limiting active per user', critical: true },
        { item: 'Anthropic API key rotation scheduled', critical: false },
        { item: 'WAF configured for DDoS protection', critical: true },
      ],
    },
    {
      name: 'Payments',
      items: [
        { item: 'Stripe integration tested with test card', critical: true },
        { item: 'Subscription upgrade/downgrade flow works', critical: true },
        { item: 'Cancellation flow works + sends cancellation email', critical: true },
        { item: 'Failed payment retry logic configured', critical: true },
        { item: 'Invoice/receipt emails sending correctly', critical: true },
        { item: 'Proration on plan changes calculated correctly', critical: false },
        { item: 'Annual billing generates correct charges', critical: true },
        { item: 'Refund process tested', critical: false },
      ],
    },
    {
      name: 'Legal & Compliance',
      items: [
        { item: 'Privacy Policy published + linked from footer', critical: true },
        { item: 'Terms of Service published + linked', critical: true },
        { item: 'GDPR compliance: cookie consent banner', critical: true },
        { item: 'GDPR: data deletion request flow exists', critical: true },
        { item: 'Data processing agreement for EU users', critical: false },
        { item: 'User data never used to train external models', critical: true },
        { item: 'SOC 2 compliance plan documented', critical: false },
      ],
    },
    {
      name: 'Marketing & Distribution',
      items: [
        { item: 'Landing page load time < 2s (Lighthouse score > 90)', critical: true },
        { item: 'OG tags + Twitter card meta tags', critical: true },
        { item: 'Welcome email sending correctly', critical: true },
        { item: 'All email sequences tested (no broken links)', critical: true },
        { item: 'Product Hunt listing draft ready for review', critical: true },
        { item: '50 PH upvote commitments secured', critical: true },
        { item: 'Social accounts posted intro content', critical: false },
        { item: 'Network DM list (200+ contacts) ready', critical: true },
        { item: 'Press kit (logo, screenshots, one-liner) ready', critical: false },
        { item: 'Analytics events firing correctly', critical: true },
      ],
    },
    {
      name: 'Support Readiness',
      items: [
        { item: 'Support email set up and monitored', critical: true },
        { item: 'FAQ page published', critical: false },
        { item: 'Onboarding checklist shown to new users', critical: true },
        { item: 'In-app chat (Intercom/Crisp) configured', critical: false },
        { item: 'Incident response plan documented', critical: true },
        { item: 'Rollback procedure tested', critical: true },
        { item: 'Status page (statusnexus.ai) live', critical: false },
      ],
    },
  ],

  // Auto-score
  score() {
    const all = this.categories.flatMap(c => c.items);
    const critical = all.filter(i => i.critical);
    return {
      total: all.length,
      critical: critical.length,
      message: `Complete all ${critical.length} critical items before launching. Non-critical can ship in v1.1.`,
    };
  },
};

// Quick export for use in dashboard
export default {
  emailSequences: EMAIL_SEQUENCES,
  productHunt: PRODUCT_HUNT_KIT,
  socialCalendar: SOCIAL_CALENDAR,
  launchDayPlan: LAUNCH_DAY_PLAN,
  networkCRM: NETWORK_CRM,
  analytics: ANALYTICS_FRAMEWORK,
  checklist: LAUNCH_CHECKLIST,

  summary: {
    totalEmailsInSequence: Object.values(EMAIL_SEQUENCES).flat().length,
    totalSocialPosts: SOCIAL_CALENDAR.week1.length,
    totalChecklistItems: LAUNCH_CHECKLIST.categories.flatMap(c => c.items).length,
    criticalChecklistItems: LAUNCH_CHECKLIST.categories.flatMap(c => c.items).filter(i => i.critical).length,
    networkReach: NETWORK_CRM.segments.reduce((sum, s) => sum + s.size, 0),
    launchDayActivities: LAUNCH_DAY_PLAN.timeline.length,
  },
};
