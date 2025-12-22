import PremiumHeader from "@/components/prototype-editor/PremiumHeader";
import Footer from "@/components/shared/Footer";
import { GridBackground } from "@/components/shared/GridComponent";

export default function TermsAndConditionsPage() {
  return (
    <main className="relative min-h-screen bg-[#0B0C0E] text-white selection:bg-indigo-500/30 overflow-hidden font-sans">
      <GridBackground forceDarkMode />

      <div className="relative z-10">
        <PremiumHeader forceDarkMode />

        <section className="pt-32 pb-12 lg:pt-48 px-6 border-b border-white/5">
          <div className="container mx-auto max-w-4xl text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50 mb-4">
              Terms and Conditions
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white mb-6">
              Nucleate Terms of Service
            </h1>
            <p className="text-lg md:text-xl text-[#8A8F98] max-w-2xl mx-auto">
              Please read these Terms carefully before using Nucleate.
            </p>
          </div>
        </section>

        <section className="py-16 px-6">
          <div className="container mx-auto max-w-4xl space-y-12">
            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                A. Terms of Service
              </h2>
              <p className="text-[#8A8F98]">
                Summary: When you use Nucleate, you are agreeing to these terms
                and our Privacy Policy, and promising to safeguard your account.
                You agree to use the service for non-commercial purposes and are
                of legal age to accept these terms. If you are a commercial
                user, please visit our Nucleate Teams page for more information.
              </p>
              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Acceptance of Terms</span>
                  <p className="mt-2">
                    Nucleate, Inc. (&quot;Nucleate&quot;) provides users with a
                    hosted environment and community to code, build, share, and
                    deploy software and web servers through our websites and
                    apps (the &quot;Service&quot;). By using the Service, you
                    are entering into a binding agreement with Nucleate, and you
                    agree to comply with these Terms of Service
                    (&quot;Terms&quot;) and also agree to our Privacy Policy; if
                    you do not agree, you must not use the Service.
                  </p>
                </li>
                <li>
                  <span className="text-white">Account Usage and Security</span>
                  <p className="mt-2">
                    You are responsible for maintaining the confidentiality of
                    your account and password, including but not limited to the
                    restriction of access to your computer and/or account.
                  </p>
                </li>
                <li>
                  <span className="text-white">
                    Personal and non-commercial use
                  </span>
                  <p className="mt-2">
                    Unless otherwise specified, the Service is for your personal
                    and non-commercial use. If you are planning to use the
                    Service for commercial purposes, Nucleate requests that you
                    subscribe to Nucleate Teams and agree to the Teams Product
                    Agreement, which will then apply.
                  </p>
                </li>
                <li>
                  <span className="text-white">Minimum Age</span>
                  <p className="mt-2">
                    You must be an adult to use the Service. If you are younger
                    than 13 we will allow you to use the Service if you first
                    provide us with your parent or guardian&apos;s written
                    consent. If you are a parent or legal guardian of a user
                    under the age of 18, by allowing your child to use the
                    Service, you are subject to these Terms and responsible for
                    your child&apos;s activity on the Service.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                B. Acceptable Use
              </h2>
              <p className="text-[#8A8F98]">
                Summary: Nucleate hosts a wide variety of coding projects from
                all over the world, and that hosting only works when our users
                are able to work together and not abuse the Service. Certain
                conduct and content are prohibited on Nucleate. In addition, we
                set quotas and limits that you must follow.
              </p>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Prohibited Conduct</span>
                  <p className="mt-2">
                    While using the Service, you must not engage in any conduct
                    that is abusive or violates applicable laws, regulations, or
                    these Terms. Prohibited conduct includes:
                  </p>
                  <ul className="list-disc pl-6 mt-3 space-y-2">
                    <li>
                      Interfering with, disrupting, or creating an undue burden
                      on the Service, including by sending excessive data or
                      requests to the Service, artificially utilizing excessive
                      container resources, or by copying projects to run or host
                      the same code.
                    </li>
                    <li>
                      Abusive advertising, spamming, or commercial solicitation.
                    </li>
                    <li>
                      Phishing or impersonation, whether or not the target is a
                      user of the Service.
                    </li>
                    <li>
                      Creating accounts with automation or registering accounts
                      in bulk.
                    </li>
                    <li>
                      Conducting network attacks, whether against the Service or
                      against any other party.
                    </li>
                    <li>Mining Bitcoin, other cryptocurrencies, or Cycles.</li>
                    <li>
                      Scraping or otherwise obtaining content, whether for
                      training or extracting data for machine learning models,
                      reverse-engineering any part of the Service, or for any
                      other purpose.
                    </li>
                    <li>
                      Infringing the privacy of other users, including by
                      harvesting personal information.
                    </li>
                    <li>
                      Using accounts to evade a ban or penalty from Nucleate.
                    </li>
                  </ul>
                </li>
                <li>
                  <span className="text-white">Prohibited Content</span>
                  <p className="mt-2">
                    You are solely responsible for the content you create,
                    submit, and share on the Service. The following content is
                    prohibited and you agree not to post such content to the
                    Service:
                  </p>
                  <ul className="list-disc pl-6 mt-3 space-y-2">
                    <li>
                      Defamatory, harassing, abusive, threatening, or bullying.
                    </li>
                    <li>
                      Profanity, violent, or graphic content, including hate
                      speech or symbols.
                    </li>
                    <li>
                      Visual depictions or explicit descriptions of sex and
                      nudity, including sexual advances and solicitation, and
                      offers of sexual services.
                    </li>
                    <li>Promoting illegal conduct.</li>
                    <li>Hoaxes, malware, and pyramid schemes.</li>
                    <li>
                      Infringing the intellectual property rights of others.
                    </li>
                    <li>Disrupting the experience of other users.</li>
                  </ul>
                </li>
                <li>
                  <span className="text-white">Quotas and Limits</span>
                  <p className="mt-2">
                    Nucleate may establish usage quotas and limits that govern
                    your usage of the platform, including but not limited to
                    computing resources, storage, and data transfer. You agree
                    to follow these quotas and limits as they are defined by
                    Nucleate. For more information, see our documentation.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                C. Content on Nucleate
              </h2>
              <p className="text-[#8A8F98]">
                Summary: You affirm you own the rights to the content you post
                to Nucleate. You give us permission to host your content, make
                your content available to others, and to use it to improve our
                Service. Other content on Nucleate comes from various sources
                and is provided for you to use at your own risk and subject to
                limitations.
              </p>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Your Content and Ownership</span>
                  <p className="mt-2">
                    When you submit content to the Service, you affirm that you
                    hold all of the rights to the content or have obtained all
                    necessary permissions and rights from the owner to share it
                    on the Service. Except as provided in these terms, you
                    retain any and all of your rights to any content you submit,
                    post, or display on or through the Service, and you are
                    responsible for protecting those rights.
                  </p>
                  <p className="mt-2">
                    To provide the Service, you grant Nucleate the right to
                    copy, display, distribute, perform, reformat, and modify
                    your content as necessary, and the right to sublicense such
                    rights to any third party provider for the Service.
                  </p>
                </li>
                <li>
                  <span className="text-white">Public Apps</span>
                  <p className="mt-2">
                    Content you publish as a public App is automatically made
                    subject to the MIT License, which allows others to view,
                    copy, modify, and distribute your code, on or off platform.
                    Other users may &quot;fork&quot; your public Apps, which
                    will provide them a copy of your App that they control. It
                    is your responsibility to ensure that your content is
                    compatible with the MIT License before publishing. If you do
                    not wish to or cannot have your code licensed under the MIT
                    License, you must make it a private App, as explained in the
                    Licensing Information documentation.
                  </p>
                  <p className="mt-2">
                    Content published in public Apps may be used by Nucleate for
                    improving the Service, including but not limited to
                    developing or training large language models, both during
                    and after the term of this agreement.
                  </p>
                </li>
                <li>
                  <span className="text-white">Private Apps</span>
                  <p className="mt-2">
                    Content in private Apps is not made available to the public.
                    You may apply specific licensing terms to your code in a
                    Private App. However, you also grant Nucleate the right to
                    display, distribute, and modify your content as necessary to
                    provide the Service. Nucleate reserves the right to access
                    the content of your private Apps for the purpose of
                    troubleshooting, improving our service, and ensuring the
                    safety and security of the Service.
                  </p>
                </li>
                <li>
                  <span className="text-white">Third Party Content</span>
                  <p className="mt-2">
                    Content on the Service originates from various sources and
                    is made accessible for your use on the Service only. You
                    acknowledge that your access and use of this content is at
                    your own risk. You are not authorized to use such content
                    outside of the Service, nor to download third party content
                    from the Service.
                  </p>
                </li>
                <li>
                  <span className="text-white">Nucleate Ownership</span>
                  <p className="mt-2">
                    Nucleate owns and retains all right, title, and interest in
                    and to the Service and related software, all improvements,
                    enhancements or modifications thereto, and all intellectual
                    property rights associated with the foregoing. Except for
                    the limited access rights expressly granted to you in these
                    Terms, you obtain no rights to the Services or intellectual
                    property rights by implication, estoppel, or otherwise. You
                    must not use the trademarks, trade dress, or other
                    intellectual property of Nucleate without our prior written
                    consent.
                  </p>
                </li>
                <li>
                  <span className="text-white">
                    Data Protection and Privacy
                  </span>
                  <p className="mt-2">
                    Your privacy is important to us. As explained in our Privacy
                    Policy, which is part of this Terms, we want to inform you
                    that we collect, use, and share your personal information
                    and usage data to provide and improve the Service,
                    communicate with you, and for security purposes. We comply
                    with applicable privacy laws, including GDPR and CCPA, in
                    our handling of personal data. By using the Service, you
                    consent to such processing and you warrant that all data
                    provided by you is accurate.
                  </p>
                </li>
                <li>
                  <span className="text-white">Copyright Violations</span>
                  <p className="mt-2">
                    Nucleate takes copyright infringement seriously. If you
                    believe that your copyright has been violated on the
                    platform, please promptly notify us of the infringement
                    following the procedure established under the Digital
                    Millennium Copyright Act (DMCA), as explained in our
                    documentation.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                D. Purchases
              </h2>
              <p className="text-[#8A8F98]">
                Summary: You are responsible to pay for any purchases, recurring
                subscription fees, and usage fees that you incur on the Service.
                We reserve the right to refuse or cancel purchases in cases of
                error or fraud.
              </p>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Subscription Services</span>
                  <p className="mt-2">
                    You may acquire subscription services from Nucleate to add
                    additional features to your account. Your subscription will
                    automatically be rebilled at the end of your subscription
                    term at the then-currently applicable rates. Prices are
                    subject to change at the end of a subscription term.
                  </p>
                </li>
                <li>
                  <span className="text-white">Pricing and Usage Fees</span>
                  <p className="mt-2">
                    For details of current pricing, consult our pricing page,
                    which may be updated from time to time.
                  </p>
                  <p className="mt-2">
                    You may incur additional usage fees if you exceed the limits
                    associated with your account or current plan. You are
                    responsible for the payment of these fees, and which may be
                    automatically billed to your credit card or payment method
                    associated with your account. Your account may be limited or
                    terminated if not paid.
                  </p>
                </li>
                <li>
                  <span className="text-white">Refunds</span>
                  <p className="mt-2">
                    We allow for full refunds for subscription payments made
                    within 30 days of purchase. However, Usage-Based Billing
                    (UBB) charges are non-refundable, as they reflect metered
                    usage that has already occurred. Refunds are only available
                    for the most recent subscription charge and do not apply to
                    partial usage or past billing cycles. To request a refund,
                    contact our support team (support@nucleate.dev) with your
                    account details and invoice number.
                  </p>
                </li>
                <li>
                  <span className="text-white">Extensions</span>
                  <p className="mt-2">
                    The Extensions Store enables you to access Apps to work with
                    and extend the capabilities of your workspace and individual
                    Apps. Extensions within the Store are published by Nucleate
                    and also third-party providers (&quot;Developers&quot;). As
                    an Extension user, your access and use rights are
                    supplemented by the Nucleate Extensions Store - User Terms.
                    The Extensions Store also enables you to create and provide
                    Extensions for use by other users. As an Extension
                    Developer, your access and use rights are subject to the
                    Nucleate Extensions Store - Developer Terms.
                  </p>
                </li>
                <li>
                  <span className="text-white">Purchase of Cycles</span>
                  <p className="mt-2">
                    Nucleate provides the option to acquire Cycles, a virtual
                    token for accessing features on the Service. Cycles have no
                    cash value and are not refundable or redeemable for cash.
                    For more details, consult our Cycles Terms which are
                    incorporated into these Terms.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                E. Notices, Changes, and Termination
              </h2>
              <p className="text-[#8A8F98]">
                Summary: We may make changes to these terms and conditions at
                any time. If you provide an email address, we may use it to
                contact you with service announcements. Your account may be
                terminated at our sole discretion.
              </p>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">
                    Modification of Terms and Conditions
                  </span>
                  <p className="mt-2">
                    Nucleate reserves the right in its sole discretion to modify
                    or replace these terms and conditions at any time by
                    updating these Terms. It is your responsibility to regularly
                    review the terms to ensure that you are aware of any changes
                    or updates. Continued use of the Service after any
                    modifications implies your acceptance of the new terms.
                  </p>
                </li>
                <li>
                  <span className="text-white">Service Announcements</span>
                  <p className="mt-2">
                    You consent to receiving Service announcements and updates
                    from Nucleate via email or from within the Service. These
                    announcements may include information about new features,
                    changes, pricing updates, or important updates regarding
                    your account. If your email address is not valid, any
                    notices sent to that address will nevertheless be considered
                    to have been sent and received.
                  </p>
                </li>
                <li>
                  <span className="text-white">Account Termination</span>
                  <p className="mt-2">
                    Upon termination, your right to use the Service will cease
                    immediately. If you wish to delete your account, you may
                    request account deletion at https://nucleate.dev/account by
                    selecting &quot;Request Account Deletion.&quot; Upon account
                    deletion, we will delete your stored data in accordance with
                    our data retention policy and applicable law.
                  </p>
                  <p className="mt-2">
                    Nucleate holds, in its sole discretion, the right to suspend
                    or terminate your account. This may occur for various
                    reasons, including but not limited to violations of these
                    Terms, prohibited conduct, inactivity, or any other actions
                    that Nucleate deems as detrimental to the platform or its
                    users. In such cases, Nucleate will not refund fees that you
                    have already paid.
                  </p>
                </li>
                <li>
                  <span className="text-white">Survival</span>
                  <p className="mt-2">
                    All provisions of these Terms which by their nature should
                    survive termination shall survive termination, including,
                    without limitation, ownership provisions, warranty
                    disclaimers, indemnity, and limitations of liability.
                  </p>
                </li>
                <li>
                  <span className="text-white">
                    Deprecation of Service Features
                  </span>
                  <p className="mt-2">
                    Nucleate reserves the right to modify, deprecate, or remove
                    features of the Service at any time and for any reason;
                    Nucleate will not refund any fees paid.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                F. Limitations and Disclaimers
              </h2>
              <p className="text-[#8A8F98]">
                Summary: The Service may contain errors, inaccuracies, or
                omissions, which we may correct at any time. As you use the
                Service at your own risk, we do not accept responsibility for
                loss or damage. You agree to indemnify us for any loss we suffer
                from your use of the Service.
              </p>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Content Accuracy</span>
                  <p className="mt-2">
                    The Service may contain errors, inaccuracies, or omissions
                    in the content provided. Code generated or suggested by our
                    AI systems may be erroneous or incomplete. We reserve the
                    right to correct such errors, inaccuracies, or omissions at
                    any time to improve the quality of the platform, but accept
                    no responsibility or liability for the accuracy of content
                    on the Service.
                  </p>
                </li>
                <li>
                  <span className="text-white">Use at Your Own Risk</span>
                  <p className="mt-2">
                    Your use of Nucleate is entirely at your own risk. Nucleate
                    disclaims any responsibility for any loss or damage that may
                    result from your use of the platform. You acknowledge that
                    you are using Nucleate with the understanding that it comes
                    with inherent risks.
                  </p>
                </li>
                <li>
                  <span className="text-white">Disclaimer of Warranties</span>
                  <p className="mt-2">
                    Your use of the Service is at your sole risk. The Service is
                    provided on an &quot;AS IS&quot; and &quot;AS
                    AVAILABLE&quot; basis. To the fullest extent permitted by
                    law, the Service is provided without warranties of any kind,
                    whether express or implied, including, but not limited to,
                    implied warranties of merchantability, fitness for a
                    particular purpose, non-infringement or course of
                    performance.
                  </p>
                  <p className="mt-2">
                    Nucleate, its subsidiaries, affiliates, and its licensors do
                    not warrant that (a) the Service will function
                    uninterrupted, be error-free, secure or available at any
                    particular time or location; (b) any errors or defects will
                    be corrected; (c) the Service is free of viruses or other
                    harmful components; (d) the results of using the Service
                    will meet your requirements; or (e) that the Service and/or
                    any content made available through the Service will be
                    accurate or complete.
                  </p>
                </li>
                <li>
                  <span className="text-white">Limitation of Liability</span>
                  <p className="mt-2">
                    To the maximum extent permitted by law, Nucleate will not be
                    liable for any direct, indirect, incidental, special,
                    consequential, or punitive damages, or any loss of profits
                    or revenues, whether incurred directly or indirectly, or any
                    loss of data, use, goodwill, or other intangible losses,
                    resulting from (a) your access to or use of or inability to
                    access or use the Service; (b) any conduct or content of any
                    third party on the Service; (c) any content obtained from
                    the Service; and (d) unauthorized access, use, or alteration
                    of your transmissions or content.
                  </p>
                  <p className="mt-2">
                    Nucleate assumes no liability or responsibility for any
                    errors, mistakes or inaccuracies of content, any personal
                    injury or property damage, of any nature whatsoever,
                    resulting from your access to and use of the Service, any
                    unauthorized access to or use of our Service, any
                    interruption or cessation of transmission to or from the
                    Service, any bugs, viruses, malicious software, or the like
                    which may be transmitted to or through our Service by any
                    third party and/or any errors or omissions in any content or
                    for any loss or damage of any kind incurred as a result of
                    the use of the Service and/or any content posted, emailed,
                    transmitted or otherwise made available via the Service.
                  </p>
                  <p className="mt-2">
                    Nucleate has no control over, and to the fullest extent
                    permitted by law, assumes no responsibility for the content,
                    privacy policies, or practices of any third-party web sites
                    or services. We do not warrant the offerings of any of these
                    entities/individuals or their websites. You acknowledge and
                    agree that Nucleate cannot and will not review, censor,
                    endorse, or edit the content of any third-party site,
                    services, or advertisements.
                  </p>
                </li>
                <li>
                  <span className="text-white">Indemnification</span>
                  <p className="mt-2">
                    You are responsible for any claims against Nucleate
                    regarding your use of the Service. By using the Service, you
                    agree to indemnify and hold Nucleate harmless from any loss
                    or damage incurred by Nucleate as a result of your use of
                    the platform. This includes but is not limited to legal
                    costs and expenses related to any actions, claims, or
                    disputes arising from your use of the Service.
                  </p>
                </li>
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-white">
                G. General Terms
              </h2>

              <ol className="list-decimal pl-6 space-y-4 text-[#8A8F98]">
                <li>
                  <span className="text-white">Feedback and Suggestions</span>
                  <p className="mt-2">
                    Any feedback, comments, ideas, improvements, or suggestions
                    (collectively, &quot;Suggestions&quot;) provided by you to
                    Nucleate with respect to the Service will remain the sole
                    and exclusive property of Nucleate. Nucleate will be free to
                    use, copy, modify, publish, or redistribute the Suggestions
                    for any purpose and in any way without any credit or any
                    compensation to you.
                  </p>
                </li>
                <li>
                  <span className="text-white">Jurisdiction</span>
                  <p className="mt-2">
                    These Terms are governed by the laws of the State of
                    California. Any disputes under this agreement will be
                    resolved in a court of general jurisdiction in San
                    Francisco, California. You hereby expressly agree to submit
                    to the exclusive personal jurisdiction of this jurisdiction
                    for the purpose of resolving any dispute relating to this
                    agreement.
                  </p>
                </li>
                <li>
                  <span className="text-white">Entire Agreement</span>
                  <p className="mt-2">
                    These Terms are the parties&apos; entire agreement regarding
                    its subject matter and supersede any prior or
                    contemporaneous agreements regarding its subject matter.
                  </p>
                </li>
                <li>
                  <span className="text-white">Severability</span>
                  <p className="mt-2">
                    If any provision of these Terms are found by a court of
                    competent jurisdiction to be illegal, invalid, or
                    unenforceable, the parties will modify or reform the Terms
                    to give as much effect as possible to that provision.
                  </p>
                  <p className="mt-2">
                    Any provision that cannot be modified or reformed in this
                    way will be deemed deleted and the remaining provisions of
                    these Terms will continue in full force and effect.
                  </p>
                </li>
                <li>
                  <span className="text-white">Assignment of Rights</span>
                  <p className="mt-2">
                    Nucleate reserves the right to assign its rights to another
                    party at its discretion. However, you may not assign or
                    transfer your rights or obligations under these Terms
                    without prior written consent from Nucleate.
                  </p>
                </li>
                <li>
                  <span className="text-white">Google APIs</span>
                  <p className="mt-2">
                    Nucleate&apos;s use and transfer of information received
                    from Google APIs to any other app is subject to
                    Nucleate&apos;s Privacy Policy and will adhere to
                    Google&apos;s API Services User Data Policy including the
                    Limited Use requirements.
                  </p>
                </li>
                <li>
                  <span className="text-white">Contact</span>
                  <p className="mt-2">
                    If you have any questions about these Terms, please contact
                    Support.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
