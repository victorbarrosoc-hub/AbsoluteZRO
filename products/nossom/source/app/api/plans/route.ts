import { supabase } from '@/lib/server/supabase';
import { initialPlans, type Plan } from '@/lib/plans';
export async function GET() {
  try {
    const plans = await supabase<Plan[]>('/rest/v1/rpc/nossom_plan_catalog', {
      method: 'POST',
      body: {},
    });
    return Response.json({ plans }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return Response.json({ plans: initialPlans }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
