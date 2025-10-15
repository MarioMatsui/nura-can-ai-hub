-- Allow users to delete their own cancellation requests
CREATE POLICY "Users can delete their own cancellation requests"
ON public.cancellation_requests
FOR DELETE
USING (auth.uid() = user_id);