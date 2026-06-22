import { useState } from 'react'
import Sidebar from '../components/Sidebar'

const faqs = [
  {
    category: 'Getting Started',
    items: [
      { q: 'How do I create my first proposal?', a: 'Click New Proposal in the sidebar or dashboard. Fill in the rep and client details, then add your line items either by typing them in or uploading an Excel file. Click Submit Proposal when ready.' },
      { q: 'How do I add my company branding to proposals?', a: 'Go to Settings and upload your company logo, set your brand color, and enter your company name. These will automatically appear on all PDF proposals you generate.' },
      { q: 'How do I add team members?', a: 'Go to the Team page in the sidebar. Click Add Rep, enter their name, email, and a temporary password. They will be added to your organization and can log in immediately.' },
      { q: 'How do I add clients?', a: 'Go to the Clients page and click Add Client. Once added, you can click any client to view all their proposals and create new ones pre-filled with their details.' }
    ]
  },
  {
    category: 'Proposals',
    items: [
      { q: 'How do I generate a Scope of Work?', a: 'Open a proposal and click the Generate SOW button. ForgePt. will use your BOM line items to automatically write a professional scope of work. You can regenerate it anytime after editing the BOM.' },
      { q: 'Can I edit the Scope of Work after it is generated?', a: 'Yes — click into the Scope of Work text on the proposal detail page to edit it directly. Changes are saved automatically.' },
      { q: 'How do I download a proposal as a PDF?', a: 'Open any proposal and click the Download PDF button next to the Scope of Work section. The PDF will include your branding, scope of work, BOM pricing, and terms and conditions.' },
      { q: 'How do I link a proposal to a client?', a: 'When creating a new proposal, use the Select Client dropdown to choose an existing client. Their details will auto-fill. You can also create proposals directly from the client detail page.' },
      { q: 'How do I upload a BOM from Excel?', a: 'On the New Proposal page, click Upload Excel and select your file. Download the template first to make sure your columns are formatted correctly. Supported formats are .xlsx, .xls, and .csv.' }
    ]
  },
  {
    category: 'Pipeline & Forecast',
    items: [
      { q: 'What is the Pipeline view?', a: 'The Pipeline is a drag-and-drop Kanban board that shows all your proposals grouped by stage (e.g. Qualifying, Proposal Sent, Negotiating, Won). Drag any card to move it to a new stage.' },
      { q: 'How do I add or rename pipeline stages?', a: 'On the Pipeline page, click Add Stage at the end of the board to create a new column. You can customize stage names to match your sales process.' },
      { q: 'What does the Forecast page show?', a: 'The Forecast page shows your projected and won revenue by month, broken down by pipeline stage. Each stage has a weighted probability so you can see a realistic revenue projection alongside your pipeline total.' },
      { q: 'How is weighted forecast calculated?', a: 'ForgePt. applies a probability percentage to each pipeline stage (e.g. 20% for Qualifying, 80% for Negotiating). Your weighted forecast multiplies each proposal\'s value by its stage probability and sums them up.' }
    ]
  },
  {
    category: 'RFQs & Vendors',
    items: [
      { q: 'How do I send an RFQ to a vendor?', a: 'Open a proposal with line items that need pricing. Click Send All RFQs — ForgePt. will group items by vendor and prompt you for each vendor email. One email per vendor with all their items.' },
      { q: 'How do I track pricing status on line items?', a: 'Each line item has a status badge — Needs Pricing, RFQ Sent, or Confirmed. Once you receive pricing from a vendor, edit the BOM and enter the costs to mark items as Confirmed.' },
      { q: 'How do I add vendors?', a: 'Go to the Vendors page and click Add Vendor. You can store their contact info, account number, payment terms, and default markup percentage.' }
    ]
  },
  {
    category: 'Purchase Orders',
    items: [
      { q: 'How do I generate a Purchase Order?', a: 'Open a proposal and click Generate PO in the BOM section. Select the vendor, choose auto-generate or enter your own PO number, and click Generate PO. The PDF downloads and the PO is saved for tracking.' },
      { q: 'How do I track PO status?', a: 'Go to the Purchase Orders page in the sidebar to see all POs across all proposals. You can update status to Sent, Partial, Received, or Cancelled. PO status also shows on each proposal detail page.' },
      { q: 'Can I use my own PO numbering system?', a: 'Yes — when generating a PO you can choose Auto-Generate (ForgePt. assigns the next sequential number) or Enter Manually to use your own PO number format.' }
    ]
  },
  {
    category: 'Manufacturer Orders',
    items: [
      { q: 'What are Manufacturer Orders?', a: 'Manufacturer Orders track orders placed directly with manufacturers or distributors, separate from your vendor POs. They are linked to proposals and let you track fulfillment at the line-item level.' },
      { q: 'How do I track received quantities?', a: 'Open a Manufacturer Order and expand it to see individual line items. Enter the received quantity for each item as shipments arrive. The order status automatically updates to Partial or Received once quantities are entered.' },
      { q: 'How do I update an order status?', a: 'On the Manufacturer Orders page, find your order and use the status dropdown to set it to Ordered, Partial, Received, or Cancelled. You can also update the expected delivery date and notes directly inline.' }
    ]
  },
  {
    category: 'Invoices',
    items: [
      { q: 'How do I create an invoice?', a: 'Go to the Invoices page and click New Invoice. Select the proposal or client, enter the invoice amount, due date, and any notes. The invoice is saved and tracked from there.' },
      { q: 'How do I track invoice aging?', a: 'The Invoices page shows an aging badge on each overdue invoice — 1–30 days, 31–60 days, or 60+ days past due. Overdue status is updated automatically based on the due date.' },
      { q: 'What invoice statuses are available?', a: 'Invoices can be set to Draft, Sent, Paid, or Overdue. Use the status filter at the top of the Invoices page to view invoices by status. Overdue status is applied automatically when the due date passes.' }
    ]
  },
  {
    category: 'Jobs',
    items: [
      { q: 'What is a Job in ForgePt.?', a: 'A Job represents a field installation or service project linked to a proposal or client. Jobs have a job number, progress checklist, assigned technicians, and status tracking from Scheduled through to Complete.' },
      { q: 'How do I create a Job?', a: 'Go to the Jobs page and click New Job. Select the client and proposal it relates to, set a scheduled date, assign technicians, and add checklist items for the work to be completed.' },
      { q: 'How does Job progress tracking work?', a: 'Each job has a list of checklist items (tasks to complete on site). As items are marked done, the job progress bar updates in real time. When all items are checked, the job is considered complete.' },
      { q: 'Can technicians see their jobs?', a: 'Yes — technicians log in with their own credentials and see only the jobs assigned to them. They can update checklist items, log time, and add notes directly from the job view.' }
    ]
  },
  {
    category: 'Service Tickets',
    items: [
      { q: 'What are Service Tickets?', a: 'Service Tickets are support or service requests from clients — like a help desk system built into ForgePt. You can create tickets, assign them to technicians, set priority levels, and track them through to resolution.' },
      { q: 'How do I create a Service Ticket?', a: 'Go to the Service Tickets page and click New Ticket. Select the client, enter a description of the issue, set the priority (Low, Medium, High, or Urgent), and assign it to a technician.' },
      { q: 'What priority levels are available?', a: 'Service Tickets support Low, Medium, High, and Urgent priority levels. Priority is shown as a colored badge on each ticket so your team can quickly identify critical issues.' },
      { q: 'How do I filter and find tickets?', a: 'Use the Status and Priority filters at the top of the Service Tickets page to narrow down your view. You can also search by client name or ticket description using the search bar.' }
    ]
  },
  {
    category: 'Dispatch & Scheduling',
    items: [
      { q: 'What is the Dispatch board?', a: 'The Dispatch board is a visual scheduling tool for your field team. It shows all jobs and service tickets scheduled for each technician in a day or week view, with drag-and-drop to reassign or reschedule.' },
      { q: 'How do I schedule a job or ticket on the Dispatch board?', a: 'Open the Dispatch page and switch to the Unscheduled view to see work that has not been assigned a time slot. Drag items from the unscheduled list onto a technician\'s column to assign and schedule them.' },
      { q: 'Can I switch between day and week view?', a: 'Yes — use the Day/Week toggle at the top of the Dispatch page to switch views. Day view shows a single day at a time in detail; week view shows the full week for all technicians side by side.' },
      { q: 'How do I reassign a job to a different technician?', a: 'On the Dispatch board, drag the job or ticket card from one technician\'s column to another. The assignment is saved immediately.' }
    ]
  },
  {
    category: 'Tasks',
    items: [
      { q: 'How do I create a task?', a: 'Go to the Tasks page and click New Task. Enter a title, assign it to a team member, set a due date, and optionally link it to a client or proposal. Tasks can also be created as meetings with attendees.' },
      { q: 'Can I view tasks in a calendar?', a: 'Yes — use the List/Calendar toggle on the Tasks page. Calendar view shows tasks on a monthly grid so you can see workload spread across the team at a glance.' },
      { q: 'How do I schedule a meeting from a task?', a: 'When creating a task, enable the Meeting toggle. You can set start time, duration, meeting type (in-person or virtual), and add attendees by email. ForgePt. can push the meeting to Google Calendar or Microsoft Outlook if connected.' },
      { q: 'How do I connect Google or Microsoft Calendar?', a: 'Go to Settings and find the Calendar Integration section. Click Connect Google Calendar or Connect Microsoft Outlook and follow the authorization steps. Once connected, meetings created in ForgePt. will sync to your calendar automatically.' }
    ]
  },
  {
    category: 'Contracts',
    items: [
      { q: 'What are Contracts in ForgePt.?', a: 'The Contracts page lets you track service agreements, maintenance contracts, and other client agreements. Each contract has a start date, end date, type, and status (Active, Expired, or Cancelled).' },
      { q: 'How do I know when a contract is expiring?', a: 'Contracts expiring within 90 days are highlighted with a warning badge on the Contracts page. The dashboard also shows a count of contracts expiring soon so nothing slips through.' },
      { q: 'What contract types are supported?', a: 'You can categorize contracts by type — for example Service Agreement, Maintenance, Monitoring, or SLA. Use the type filter on the Contracts page to view contracts by category.' }
    ]
  },
  {
    category: 'Designer & Drawing Tool',
    items: [
      { q: 'What is the Designer?', a: 'The Designer is a built-in floor plan and system design tool. You can upload architectural drawings (PDFs or images) as a backdrop, then place security and AV symbols directly on the drawing to create a professional system design.' },
      { q: 'How do I add a drawing sheet?', a: 'Open a proposal and navigate to the Designer. Click Add Sheet to upload a floor plan or image file. You can have multiple sheets per proposal — one per floor or area.' },
      { q: 'How do I place devices on a drawing?', a: 'Select a symbol from the symbol palette on the left, then click anywhere on the drawing to place it. You can then select placed devices to assign a product from your catalog, set quantities, and add accessories.' },
      { q: 'How do I add cable runs to the drawing?', a: 'Select the Cable tool from the toolbar, then click to set the start and end points of a cable run. Cables appear as lines on the drawing and can be labeled with type and length.' },
      { q: 'How do I approve and export a design?', a: 'Once your drawing is complete, click the Approve button to lock the design and generate a reviewed drawing. Approved designs can be exported as a PDF for inclusion in your proposal package.' },
      { q: 'Can I copy and paste placements?', a: 'Yes — select a placed device on the drawing, then use the Copy button in the side panel. Click elsewhere on the drawing to paste a copy with the same product and settings.' },
      { q: 'Can I adjust camera FOV cones directly on the drawing?', a: 'Yes — click on a camera\'s FOV cone on the canvas. Drag the orange center handle to rotate and adjust range, or drag the white edge handles to widen or narrow the field of view. Changes sync to the panel on the right automatically.' },
      { q: 'Can I embed the Designer in my own platform?', a: 'Yes. Generate an API key with the "Designer (embed)" scope in Settings → API. Your server exchanges the key for a short-lived session token, which you pass to an iframe URL. The embedded designer works exactly as it does in ForgePt — same canvas, symbol picker, and device panels — but without the ForgePt navigation. When the user clicks Export BOM, the device list is sent to your page via postMessage so you can push it to your CRM or cart. See the API & Integrations section for full setup steps.' }
    ]
  },
  {
    category: 'Product Library',
    items: [
      { q: 'What is the Product Library?', a: 'The Product Library is your organization\'s central catalog of products and equipment. Products stored here can be quickly selected when adding line items to proposals, saving time and ensuring consistent pricing.' },
      { q: 'How do I import products from Excel?', a: 'On the Product Library page, click Import Excel and select your file. The importer supports QuickBooks-style exports as well as the ForgePt. template format. It will add new products and update pricing on existing ones.' },
      { q: 'What data is imported from Excel?', a: 'The importer reads product name, part number, vendor, your cost, and list price. For QuickBooks exports, it maps the Cost column to your cost and the Price column as a fallback. Vendor records are created automatically if they do not already exist.' },
      { q: 'How do I manually add a product?', a: 'On the Product Library page, click Add Product, enter the product name, part number, vendor, and pricing. The product is immediately available to use in any proposal BOM.' }
    ]
  },
  {
    category: 'Follow-ups & Emails',
    items: [
      { q: 'How does automatic follow-up work?', a: 'When a proposal status is set to Sent, ForgePt. automatically sends follow-up emails to the client on your behalf based on your cadence settings. The rep also gets a reminder notification each time.' },
      { q: 'How do I customize my follow-up schedule?', a: 'Go to Settings and find the Follow-up Cadence section. Enter the number of days before the close date you want emails sent, separated by commas. Example: 30,14,7,0 sends emails 30, 14, and 7 days before close, and on the close date.' },
      { q: 'Who does the follow-up email go to?', a: 'The client receives a friendly follow-up email on behalf of the rep. The rep also receives a reminder with a direct link to the proposal. The client reply goes directly to the rep email.' }
    ]
  },
  {
    category: 'Settings & Branding',
    items: [
      { q: 'How do I add terms and conditions to my proposals?', a: 'Go to Settings and find the Terms and Conditions section. Paste your standard terms there and they will automatically appear on the last page of every PDF proposal you generate.' },
      { q: 'How do I change my brand color?', a: 'Go to Settings and find the Brand Color field under Proposal Branding. Use the color picker or enter a hex code. Your brand color will be used in PDF headers, tables, and section headings.' },
      { q: 'How do I set a default markup percentage?', a: 'Go to Settings and enter your Default Markup % under Proposal Branding. This pre-fills the markup field when adding line items to a new proposal.' }
    ]
  },
  {
    category: 'API & Integrations',
    items: [
      { q: 'How do I get API access?', a: 'API access is available on eligible plans. Once enabled for your account, go to Settings → API to generate keys. Contact us if you need API access enabled.' },
      { q: 'How do I generate an API key?', a: 'Go to Settings → API and click Generate Key. Give the key a name (e.g. "Salesforce Integration"), select which scopes it needs (Proposals, Clients, Jobs, Designer), then click Generate. Copy the key immediately — it will only be shown once.' },
      { q: 'How do I authenticate API requests?', a: 'Include your API key in the Authorization header of every request: Authorization: Bearer fpk_your_key_here. Keys that are revoked or belong to accounts without API access will be rejected with a 401.' },
      { q: 'What endpoints are available?', a: 'The API provides access to: POST /v1/proposals (create), GET /v1/proposals (list), GET /v1/proposals/:id (with full BOM and labor), GET /v1/clients, GET /v1/clients/:id, GET /v1/jobs, GET /v1/jobs/:id, GET /v1/drawings (list projects with drawings), GET /v1/drawings/:id (sheets list), GET /v1/drawings/:id/placements (every device with position, label, and FOV), and GET /v1/drawings/:id/bom (aggregated device list). A machine-readable OpenAPI spec is available at /v1/openapi.json.' },
      { q: 'What is the base URL for the API?', a: 'All API requests go to: https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/api/v1/... — for example https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/api/v1/proposals' },
      { q: 'How do I connect ForgePt. to Salesforce or another CRM?', a: 'Use the REST API to pull proposal data into your CRM. Authenticate with your API key, call GET /v1/proposals to list deals with status, value, and close date, and GET /v1/clients for contact records. Most CRM tools (Salesforce, HubSpot, Zoho) support custom API integrations or you can use a tool like Zapier, Make, or n8n to automate the sync.' },
      { q: 'How do I get a BOM out of a floor plan drawing?', a: 'Call GET /v1/drawings/:id/bom with your API key. The response includes an aggregated list of every device placed on the drawing — part number, name, category, manufacturer, and quantity. Use GET /v1/drawings/:id/placements to get the full detail including position, label, notes, and FOV data for each individual device.' },
      { q: 'Can I embed the Designer in my own website or platform?', a: 'Yes — this is built for manufacturers who want to offer a design tool on their own site. The flow has three steps:\n\n1. Generate an API key with the "Designer (embed)" scope in Settings → API.\n\n2. From your server, call POST /functions/v1/embed-session (Authorization: Bearer your_api_key) to exchange it for a 24-hour session token. The API key never touches the browser.\n\n3. Drop an iframe into your page:\n<iframe src="https://app.forgept.com/embed?session=SESSION_TOKEN&proposal=PROPOSAL_UUID" width="100%" height="700" frameborder="0" />\n\nWhen your customer clicks "Export BOM" in the embedded designer, the iframe fires a postMessage to your page:\nwindow.addEventListener("message", (e) => {\n  if (e.data?.type === "forgept:export") {\n    const { devices, cables } = e.data // push to your CRM or cart\n  }\n})\n\nOmit the proposal parameter to auto-create a new design project on load. Or create one first via POST /v1/proposals and pass its id.' },
      { q: 'Can I use the API with an AI agent?', a: 'Yes. The OpenAPI spec at the URL below is a machine-readable description of every endpoint. The spec URL is: https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/api/v1/openapi.json\n\nFor ChatGPT: go to Explore GPTs → Create → Configure → Add actions → Import from URL, paste the spec URL, set Authentication to Bearer and paste your API key.\n\nFor Claude: open the spec URL in a browser, copy the JSON, paste it into a Claude Project with your API key and tell Claude to use it.\n\nFor n8n: add an AI Agent node with an HTTP Request tool pointed at the spec URL and your API key in the Authorization header.\n\nFor Postman: click Import, paste the spec URL, and every endpoint is imported automatically.' },
      { q: 'What are API scopes?', a: 'Scopes limit what a key can access. A key with only the Proposals scope cannot read client or job data. Assign the minimum scopes needed for each integration — for example, a CRM sync key gets Proposals and Clients, while a drawing export key gets Designer only. This limits exposure if a key is ever compromised.' },
      { q: 'How do I revoke an API key?', a: 'Go to Settings → API and click Revoke next to the key. It stops working immediately. Any integration using that key will get a 401 error and will need to be updated with a new key.' }
    ]
  }
]

export default function FAQ({ isAdmin, featureProposals = true, featureCRM = false }) {
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
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6 max-w-3xl">
        <div>
          <h2 className="text-white text-2xl font-bold">FAQ & Help</h2>
          <p className="text-[#8A9AB0] mt-1">Everything you need to know about using ForgePt.</p>
        </div>

        <input type="text" placeholder="Search for help..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />

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
                      <button onClick={() => setOpenItem(isOpen ? null : key)}
                        className="w-full text-left px-4 py-3 flex justify-between items-center hover:bg-[#0F1C2E] transition-colors">
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
          <a href="mailto:hello@goforgept.com" className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors inline-block">
            Contact Support
          </a>
        </div>
      </div>
    </div>
  )
}