/* ============================================================
   F&L constants — legal docs (src/constants/legal.ts)
   Copy for /terms and /privacy. Not legal advice — review with
   qualified counsel before publishing as binding agreements.
   ============================================================ */

export type LegalSection = { title: string; body: string[] }
export type LegalDoc = { title: string; updated: string; sections: LegalSection[] }

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: '27 October 2026',
  sections: [
    {
      title: '1. About these terms',
      body: [
        'These Terms of Service ("Terms") govern your access to and use of the F&L platform, including the website, your F&L account, dedicated virtual account details, and custodial wallet services (together, the "Services"). By creating an account or using the Services, you agree to be bound by these Terms.',
        'Freight And Logistics LLC ("F&L") is a financial technology company, not a bank. Virtual account details are issued through partner banking institutions, and balances are held in custody 1:1 against asset-backed stablecoins.',
      ],
    },
    {
      title: '2. Eligibility & identity verification',
      body: [
        'You must be at least 18 years old and legally able to enter into binding contracts. To use the Services you must complete one-time identity verification ("KYC") through our automated check. You agree to provide accurate, current information and to respond to follow-up requests from our compliance team.',
        'We may refuse, delay, or reverse transactions — or restrict account features — where required by law, where verification is incomplete, or where we reasonably suspect fraud, sanctions exposure, or money laundering.',
      ],
    },
    {
      title: '3. Your account',
      body: [
        'You are responsible for maintaining the confidentiality of your sign-in credentials and passkeys, and for all activity that occurs under your account. Notify us immediately at mohamed@freightandlogistics.online if you suspect unauthorized access.',
        'Dedicated US routing/account numbers and European IBANs issued to you remain the property of the issuing partner institution. You may not use the account details for unlawful activity, gambling where prohibited, or processing payments on behalf of third parties.',
      ],
    },
    {
      title: '4. Sending & receiving money',
      body: [
        'Incoming funds (ACH, FedNow, Wire, SEPA) are credited to your balance once confirmed on the applicable rail. You may send funds to bank accounts or supported wallets in 80+ countries. Transmission times and availability depend on networks outside our reasonable control.',
        'You must ensure the recipient details you provide are correct. Once a transfer to an incorrect destination has been successfully executed, recovery cannot be guaranteed.',
      ],
    },
    {
      title: '5. Fees & exchange rates',
      body: [
        'We publish all applicable fees before you confirm a transfer. Cross-border transfers use the mid-market exchange rate at the time of execution; we do not apply hidden spread markups unless expressly disclosed on screen.',
        'Yield, where earned on balances held in custody, is generated from underlying assets of the backing portfolio and is variable — past performance does not guarantee future returns.',
      ],
    },
    {
      title: '6. Suspension & termination',
      body: [
        'You may close your account at any time, provided all pending activity is resolved and required record-keeping windows have passed. We may suspend or terminate access where breach of these Terms, applicable law, or compliance requirements require it.',
        'On closure, remaining balances are returned to your linked bank account, subject to any deduction of amounts owed to F&L.',
      ],
    },
    {
      title: '7. Liability',
      body: [
        'We provide the Services "as is" without warranties of uninterrupted availability. To the extent permitted by law, F&L is not liable for indirect or consequential losses, including loss of profits or goodwill.',
        'Nothing in these Terms limits liability that cannot lawfully be limited. Questions about these Terms? Contact Freight And Logistics LLC: mohamed@freightandlogistics.online · +1 (201) 737-1175 · 25 Roseland Ave, 2FL, Caldwell NJ 07006.',
      ],
    },
  ],
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: '27 October 2026',
  sections: [
    {
      title: '1. What we collect',
      body: [
        'Account data you provide during account sign-up and KYC: full name, email address, avatar, and government ID / liveness data processed by our verification partner. Transaction data: payments sent and received, recipients, amounts, and rail used.',
        'Technical data: device and browser information, IP address, and product usage events, used to keep the Services secure.',
      ],
    },
    {
      title: '2. How we use it',
      body: [
        'To operate your account: issuing account details, complying with KYC/AML obligations, executing transfers, and providing support.',
        'To keep F&L safe: detecting fraud, enforcing these Terms, and meeting legal or regulatory reporting duties.',
      ],
    },
    {
      title: '3. Sharing',
      body: [
        'We share data only with the processors required to run the Services: identity-verification providers, banking and custody partners, payment networks, infrastructure providers, and — where legally compelled — regulators or law enforcement.',
        'We never sell your personal data.',
      ],
    },
    {
      title: '4. Storage & security',
      body: [
        'Data is stored on managed cloud infrastructure with encryption in transit and at rest. Access is restricted to personnel who need it for their role, and moved under strict contractual safeguards.',
      ],
    },
    {
      title: '5. Your rights',
      body: [
        'You may request access to, correction of, or deletion of your personal data, and may object to certain processing. Email mohamed@freightandlogistics.online and we will respond within the window required by applicable law.',
      ],
    },
    {
      title: '6. Contact',
      body: [
        'Freight And Logistics LLC ("F&L") operates this Service. For any privacy question, request, or complaint, contact mohamed@freightandlogistics.online · +1 (201) 737-1175, or write to 25 Roseland Ave, 2FL, Caldwell NJ 07006. This policy covers the website and app; partner banking institutions maintain their own notices.',
      ],
    },
  ],
}
