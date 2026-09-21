-- Browser MediaRecorder reports video/webm;codecs=vp9,opus which is not
-- in a strict allow-list. Accept any type; the app still sends video/webm or video/mp4.
update storage.buckets
set allowed_mime_types = null
where id = 'interviews';
