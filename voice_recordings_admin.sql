
-- ============================================================
-- Romantic Proposal — Create recordings administrator
-- ============================================================

-- Add the account you created in Supabase Authentication → Users
INSERT INTO public.admin_users (user_id)
SELECT id
FROM auth.users
WHERE email = 'harinadhnaik123@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Verify administrator access
SELECT
    u.email,
    a.user_id,
    a.created_at
FROM public.admin_users AS a
JOIN auth.users AS u
    ON u.id = a.user_id
WHERE u.email = 'harinadhnaik123@gmail.com';

-- Expected: exactly one row containing your email.
