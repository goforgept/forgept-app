import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'

const ProfileContext = createContext(null)

const PROFILE_SELECT = 'id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip, payment_instructions_payable_to, payment_instructions_zelle, payment_instructions_notes, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager, region_id, organizations(status, org_type, feature_proposals, feature_crm, feature_send_proposal, feature_ai_email, feature_purchase_orders, feature_invoices, feature_ai_bom, feature_site_photos, feature_sla, feature_monitoring, feature_drawing_tool, feature_designer_only, feature_spec_reader, feature_drawing_reader, feature_api, feature_regions)'

export function ProfileProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId) => {
    const impersonation = (() => {
      try { return JSON.parse(localStorage.getItem('sa_impersonate') || 'null') } catch { return null }
    })()

    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .single()

      if (data?.org_role) {
        if (data.role === 'superadmin' && impersonation?.userId) {
          const { data: impResult } = await supabase.functions.invoke('superadmin-get-profile', {
            body: { userId: impersonation.userId }
          })
          if (impResult?.profile) {
            setProfile(impResult.profile)
            setLoading(false)
            return
          }
        }
        setProfile(data)
        setLoading(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Final fallback after retries
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
        if (_event === 'SIGNED_IN') {
          supabase.rpc('update_last_login')
        }
      } else {
        setProfile(null)
        setLoading(false)
      }
    })
  }, [])

  // Auto-logout after 1 hour of inactivity
  useEffect(() => {
    if (!session) return

    const IDLE_TIMEOUT = 60 * 60 * 1000
    let timer

    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        supabase.auth.signOut()
      }, IDLE_TIMEOUT)
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [session])

  const refreshProfile = () => {
    if (session?.user?.id) fetchProfile(session.user.id)
  }

  const features = {
    proposals:      profile?.organizations?.feature_proposals !== false,
    crm:            profile?.organizations?.feature_crm || false,
    sendProposal:   profile?.organizations?.feature_send_proposal || false,
    aiEmail:        profile?.organizations?.feature_ai_email || false,
    purchaseOrders: profile?.organizations?.feature_purchase_orders !== false,
    invoices:       profile?.organizations?.feature_invoices !== false,
    aiBom:          profile?.organizations?.feature_ai_bom || false,
    sitePhotos:     profile?.organizations?.feature_site_photos !== false,
    sla:            profile?.organizations?.feature_sla || false,
    monitoring:     profile?.organizations?.feature_monitoring || false,
    drawingTool:    profile?.organizations?.feature_drawing_tool || false,
    designerOnly:   profile?.organizations?.feature_designer_only || false,
    specReader:     profile?.organizations?.feature_spec_reader || false,
    drawingReader:  profile?.organizations?.feature_drawing_reader || false,
    api:            profile?.organizations?.feature_api || false,
    regions:        profile?.organizations?.feature_regions || false,
  }

  return (
    <ProfileContext.Provider value={{ session, profile, features, loading, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
