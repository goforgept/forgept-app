-- Allow org members to delete their own clients
CREATE POLICY "org_members_can_delete_clients"
ON clients
FOR DELETE
USING (org_id = get_my_org_id());
