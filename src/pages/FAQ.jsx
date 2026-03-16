import { useState } from 'react'
import Sidebar from '../components/Sidebar'

const faqs = [
  {
    category: 'Getting Started',
    items: [
      {
        q: 'How do I create my first proposal?',
        a: 'Click New Proposal in the sidebar or dashboard. Fill in the rep and client details, then add your line items either by typing them in or uploading an Excel file. Click Submit Proposal when ready.'
      },
      {
        q: 'How do I add my company branding to proposals?',
        a: 'Go to Settings and upload your company logo, set your brand color, and enter your company name. These will automatically appear on all PDF proposals you generate.'
      },
      {
        q: 'How do I add team members?',
        a: 'Go to the Team page in the sidebar. Click Add Rep, enter their name, email, and a temporary password. They will be added to your organization and can log in immediately.'
      },
      {
        q: 'How do I add clients?',
        a: 'Go to the Clients page and click Add Client. Once added, you can click any client to view all their proposals and create new ones pre-filled with their details.'
      }
    ]
  },
  {
    category: 'Proposals',
    items: [
      {
        q: 'How do I generate a Scope of Work?',
        a: 'Open a proposal and click the Generate SOW button. ForgePt. will use your BOM line items to automatically write a professional scope of work. You can regenerate it anytime after editing the BOM.'
      },
      {
        q: 'Can I edit the Scope of Work after it is generated?',
        a: 'Yes — click into the Scope of Work text on the proposal detail page to edit it directly. Changes are saved automatically.'
      },
      {
        q: 'How do I download a proposal as a PDF?',
        a: 'Open any proposal and click the Download PDF button next to the Scope of Work section. The PDF will include your branding, scope of work, BOM pricing, and terms and conditions.'
      },
      {
        q: 'How do I link a proposal to a client?',
        a: 'When creating a new proposal, use the Select Client dropdown to choose an existing client. Their details will auto-fill. You can also create proposals directly from the client detail page.'
      },
      {
        q: 'How do I upload a BOM from Excel?',
        a: 'On the New Proposal page, click Upload Excel and select your file. Download the template first to make sure your columns are formatted correctly. Supported formats are .xlsx, .xls, and .csv.'
      }
    ]
  },
  {
    category: 'RFQs & Vendors',
    items: [
      {
        q: 'How do I send an RFQ to a vendor?',
        a: 'Open a proposal with line items that need pricing. Click Send All RFQs — ForgePt. will group items by vendor and prompt you for each vendor email. One email per vendor with all their items.'
      },
      {
        q: 'How do I track pricing status on line items?',
        a: 'Each line item has a status badge — Needs Pricing, RFQ Sent, or Confirmed. Once you receive pricing from a vendor, edit the BOM and enter the costs to mark items as Confirmed.'
      },
      {
        q: 'How do I add vendors?',
        a: 'Go to the Vendors page and click Add Vendor. You can store their contact info, account number, payment terms, and default markup percentage.'
      }
    ]
  },
  {
    category: 'Purchase Orders',
    items: [
      {
        q: 'How do I generate a Purchase Order?',
        a: 'Open a proposal and click Generate PO in the BOM section. Select the vendor, choose auto-generate or enter your own PO number, and click Generate PO. The PDF downloads and the PO is saved for tracking.'
      },
      {
        q: 'How do I track PO status?',
        a: 'Go to the Purchase Orders page in the sidebar to see all POs across all proposals. You can update status to Sent, Partial, Received, or Cancelled. PO status also shows on each proposal detail page.'
      },
      {
        q: 'Can I use my own PO numbering system?',
        a: 'Yes — when generating a PO you can choose Auto-Generate (ForgePt. assigns the next sequential number) or Enter Manually to use your own PO number format.'
      }
    ]
  },
  {
    category: 'Follow-ups & Emails',
    items: [
      {
        q: 'How does automatic follow-up work?',
        a: 'When a proposal status is set to Sent, ForgePt. automatically sends follow-up emails to the client on your behalf based on your cadence settings. The rep also gets a reminder notification each time.'
      },
      {
        q: 'How do I customize my follow-up schedule?',
        a: 'Go to Settings and find the Follow-up Cadence section. Enter the number of days before the close date you want emails sent, separated by commas. Example: 30,14,7,0 sends emails 30, 14, and 7 days before close, and on the close date.'
      },
      {
        q: 'Who does the follow-up email go to?',
        a: 'The client receives a friendly follow-up email on behalf of the rep. The rep also receives a reminder with a direct link to the proposal. The client reply goes directly to the rep email.'
      }
    ]
  },
  {
    category: 'Settings & Branding',
    items: [
      {
        q: 'How do I add terms and conditions to my proposals?',
        a: 'Go to Settings and find the Terms and Conditions section. Paste your standard terms there and they will automatically appear on the last page of every PDF proposal you generate.'
      },
      {
        q: 'How do I change my brand color?',
        a: 'Go to Settings and find the Brand Color field under Proposal Branding. Use the color picker or enter a hex code. Your brand color will be used in PDF headers, tables, and section headings.'
      },
      {
        q: 'How do I set a default markup percentage?',
        a: 'Go to Settings and enter your Default Markup % under Proposal Branding. This pre-fills the markup field when adding line items to a new proposal.'
      }
    ]
  }
]

export default function FAQ({ isAdmin }) {
  const [openItem, setOpenItem] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = faqs.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      item.q.toLowerCase().includes(search.toLowerCase()) ||
      item.a.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6 max-w-3xl">
        <div>
          <h2 className="text-white text-2xl font-bold">FAQ & Help</h2>
          <p className="text-[#8A9AB0] mt-1">Everything you need to know about using ForgePt.</p>
        </div>

        <input
          type="text"
          placeholder="Search for help..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
        />

        {filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-6 text-center">
            <p className="text-[#8A9AB0]">No results found for "{search}"</p>
            <p className="text-[#8A9AB0] text-sm mt-2">Try a different search term or browse all categories below.</p>
          </div>
        ) : (
          filtered.map(category => (
            <div key={category.category} className="bg-[#1a2d45] rounded-xl p-6">
              <h3 className="text-white font-bold text-lg mb-4">{category.category}</h3>
              <div className="space-y-2">
                {category.items.map((item, i) => {
                  const key = `${category.category}-${i}`
                  const isOpen = openItem === key
                  return (
                    <div key={key} className="border border-[#2a3d55] rounded-lg overflow-hidden">
                      <button
                        onClick={() => setOpenItem(isOpen ? null : key)}
                        className="w-full text-left px-4 py-3 flex justify-between items-center hover:bg-[#0F1C2E] transition-colors"
                      >
                        <span className="text-white text-sm font-medium">{item.q}</span>
                        <span className="text-[#C8622A] text-lg ml-4">{isOpen ? '−' : '+'}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1">
                          <p className="text-[#8A9AB0] text-sm leading-relaxed">{item.a}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6 text-center">
          <p className="text-white font-semibold mb-2">Still have questions?</p>
          <p className="text-[#8A9AB0] text-sm mb-4">Reach out to us and we will get back to you within 1 business day.</p>
          <a
            href="mailto:hello@goforgept.com"
            className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors inline-block"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  )
}
