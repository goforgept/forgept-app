import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Verify the caller is a superadmin using their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role to bypass RLS and fetch the target profile
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('id, full_name, email, org_id, role, org_role, is_superadmin, company_name, logo_url, primary_color, default_markup_percent, followup_days, phone, job_title, license_number, terms_and_conditions, about_us, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip, payment_instructions_payable_to, payment_instructions_zelle, payment_instructions_notes, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, region_id, email_template_send_subject, email_template_send_body, organizations(status, org_type, default_tax_rate, billing_status, trial_ends_at, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email, feature_purchase_orders, feature_invoices, feature_ai_bom, feature_site_photos, feature_sla, feature_monitoring, feature_drawing_tool, feature_designer_only, feature_spec_reader, feature_drawing_reader, feature_api, feature_regions, feature_msrp, feature_compliance_fields, doc_font, pdf_table_style, pdf_color_headers, cc_fee_percent, feature_inventory, feature_ai_agent, pdf_header_style, default_hide_material_prices, default_hide_labor_breakdown, default_lump_sum_labor, default_tc_font_size, warranty_templates)')
      .eq('id', userId)
      .single()

    if (error) throw error

    return new Response(JSON.stringify({ profile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
