-- Seed catalog constants from design 6.1 / 6.4 / 6.9 / 6.10.
-- Bands and voice stay EMPTY — do not invent numbers or cues.
-- Faults, families, protocols, and symptom→fault weights stay EMPTY.

-- ---------------------------------------------------------------------------
-- admin_users — first admin so magic link works.
INSERT INTO public.admin_users (email)
VALUES ('info@dialitin.ai')
ON CONFLICT (email) DO NOTHING;
-- ---------------------------------------------------------------------------

-- Metrics from 6.1 (published v1). Units inferred from the metric definition;
-- functional ranges are NOT seeded.
INSERT INTO public.metrics (
  object_id, version, status, created_by, created_by_email,
  key, name, angle, unit, description, requires_club
)
SELECT
  seed.object_id, 1, 'published', NULL, 'seed',
  seed.key, seed.name, seed.angle, seed.unit, seed.description, seed.requires_club
FROM (
  VALUES
    (
      '10000000-0000-4000-8000-000000000001'::uuid,
      'spine_tilt_at_address',
      'Spine tilt at address',
      'dtl'::public.metric_angle,
      'normalized_rotation'::public.metric_unit,
      'Posture; sets up everything downstream.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000002'::uuid,
      'pelvis_vs_tush_line',
      'Pelvis vs. tush line (early extension — thrust)',
      'dtl'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'A vertical line is set at the glutes at address; the pelvis as a whole crossing it toward the ball before impact is early extension (thrust). Family: thrust / stand-up / both.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000003'::uuid,
      'lead_hip_depth_at_impact',
      'Lead hip depth at impact (clearance)',
      'dtl'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'The lead hip should hold or exceed the tush line depth at impact. Read only when lead-hip visibility is high. A low-confidence clearance value never vetoes a clean tush-line read.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000004'::uuid,
      'spine_tilt_change',
      'Spine tilt change, address → impact',
      'dtl'::public.metric_angle,
      'normalized_rotation'::public.metric_unit,
      'Standing up / loss of posture; secondary signal alongside tush line.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000005'::uuid,
      'shoulder_rotation_at_top',
      'Shoulder rotation at top (projected)',
      'face_on'::public.metric_angle,
      'normalized_rotation'::public.metric_unit,
      'Normalized projected rotation in image space — never printed as degrees of thoracic turn.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000006'::uuid,
      'hip_rotation_at_top',
      'Hip rotation at top (projected)',
      'face_on'::public.metric_angle,
      'normalized_rotation'::public.metric_unit,
      'Projected rotation with an upper bound. Exceeding the ceiling is its own fault, often more destructive than restriction.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000007'::uuid,
      'hip_lateral_movement',
      'Hip lateral movement (sway / slide)',
      'face_on'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'Sway going back, slide coming down — both kill contact.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000008'::uuid,
      'head_sway',
      'Head sway (lateral)',
      'face_on'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'Consistency of low point; a sway signature with the trail knee. Separate from lift.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000009'::uuid,
      'head_lift',
      'Head lift (vertical)',
      'either'::public.metric_angle,
      'pct_hip_height'::public.metric_unit,
      'Stand-up; the early-extension family''s second member.',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000a'::uuid,
      'trail_knee_flexion_change',
      'Trail-knee flexion change, address → top',
      'face_on'::public.metric_angle,
      'normalized_rotation'::public.metric_unit,
      'Gate on hip rotation and sway. Stored v1; rarely a headline.',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000b'::uuid,
      'sequence_proxy',
      'Sequence proxy (hip-line peak vs shoulder-line peak timing)',
      'face_on'::public.metric_angle,
      'seconds'::public.metric_unit,
      'Does the pelvis lead the shoulders into the downswing. Never a headline.',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000c'::uuid,
      'width_at_top',
      'Width at top (lead arm structure)',
      'face_on'::public.metric_angle,
      'ratio'::public.metric_unit,
      'Lead-arm breakdown / narrow structure at the top. Not chicken wing.',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000d'::uuid,
      'lead_elbow_separation',
      'Lead elbow separation, early follow-through',
      'face_on'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'The actual chicken wing: lead elbow pulling away from the torso after impact.',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000e'::uuid,
      'downswing_hand_path',
      'Downswing hand path vs. backswing hand path (delivery slot)',
      'dtl'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'Over-the-top as an observation. Three hard gates before it is a diagnosis (6.1).',
      false
    ),
    (
      '10000000-0000-4000-8000-00000000000f'::uuid,
      'weight_transfer_proxy',
      'Weight transfer proxy (hip center vs feet)',
      'face_on'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'Reverse pivot, hanging back — crude; cannot see pressure.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000010'::uuid,
      'tempo_ratio',
      'Tempo ratio (backswing : downswing)',
      'either'::public.metric_angle,
      'ratio'::public.metric_unit,
      'Rhythm band, not a law. Computed from frame timestamps, not frame counts.',
      false
    ),
    (
      '10000000-0000-4000-8000-000000000011'::uuid,
      'ball_position_vs_lead_heel',
      'Ball position vs. lead heel',
      'face_on'::public.metric_angle,
      'pct_stance'::public.metric_unit,
      'Club-dependent: forward for driver, centered for wedge. Inferred from stance geometry — never claimed as seen.',
      true
    )
) AS seed(object_id, key, name, angle, unit, description, requires_club)
WHERE NOT EXISTS (
  SELECT 1 FROM public.metrics m WHERE m.key = seed.key AND m.status = 'published'
);

-- Symptom list + unseen notes from 6.10. Mapping weights are NOT seeded.
INSERT INTO public.symptom_notes (
  object_id, version, status, created_by, created_by_email, symptom, unseen_note
)
SELECT
  seed.object_id, 1, 'published', NULL, 'seed', seed.symptom, seed.unseen_note
FROM (
  VALUES
    (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'shank'::public.ball_symptom,
      'Hosel contact itself; face angle. Copy: your body is moving toward the ball — that''s the most common shank cause we can measure.'
    ),
    (
      '20000000-0000-4000-8000-000000000002'::uuid,
      'slice'::public.ball_symptom,
      'Face-to-path — the actual cause of curvature. A slice with a neutral path is reported as path looks fine; this is face, which we can''t see.'
    ),
    (
      '20000000-0000-4000-8000-000000000003'::uuid,
      'hook'::public.ball_symptom,
      'Face closure. Same honesty rule as slice.'
    ),
    (
      '20000000-0000-4000-8000-000000000004'::uuid,
      'fat'::public.ball_symptom,
      'Turf interaction; only the low-point proxies.'
    ),
    (
      '20000000-0000-4000-8000-000000000005'::uuid,
      'thin'::public.ball_symptom,
      'Same as fat.'
    ),
    (
      '20000000-0000-4000-8000-000000000006'::uuid,
      'push'::public.ball_symptom,
      'Face.'
    ),
    (
      '20000000-0000-4000-8000-000000000007'::uuid,
      'pull'::public.ball_symptom,
      'Face.'
    ),
    (
      '20000000-0000-4000-8000-000000000008'::uuid,
      'topping'::public.ball_symptom,
      'Contact point.'
    ),
    (
      '20000000-0000-4000-8000-000000000009'::uuid,
      'more_distance'::public.ball_symptom,
      'Club speed, ball speed, smash, launch — every number a launch monitor gives. Never a yards claim.'
    ),
    (
      '20000000-0000-4000-8000-00000000000a'::uuid,
      'consistent_contact'::public.ball_symptom,
      ''
    )
) AS seed(object_id, symptom, unseen_note)
WHERE NOT EXISTS (
  SELECT 1 FROM public.symptom_notes n
  WHERE n.symptom = seed.symptom AND n.status = 'published'
);

-- Setup-priority three bullets from 6.4. Per-tier weights left null for the pro.
INSERT INTO public.setup_priority (
  object_id, version, status, created_by, created_by_email,
  bullet_1, bullet_2, bullet_3, tier_weights
)
SELECT
  '30000000-0000-4000-8000-000000000001'::uuid,
  1,
  'published',
  NULL,
  'seed',
  'If the setup geometry produces the dynamic pattern, the setup is the headline, stated as the cause of the symptom.',
  'If the setup is a small adaptation to a big motion, the motion is the headline and the aim is named in the same sentence as also keeping the miss alive.',
  'If the setup is unconventional and the Performance DNA or the stated intent is functional, it is left alone.',
  '{
    "setup": {"ball_flight_relevance": null, "confidence": null, "severity": null, "causal_leverage": null, "changeability": null},
    "backswing": {"ball_flight_relevance": null, "confidence": null, "severity": null, "causal_leverage": null, "changeability": null},
    "downswing": {"ball_flight_relevance": null, "confidence": null, "severity": null, "causal_leverage": null, "changeability": null},
    "impact": {"ball_flight_relevance": null, "confidence": null, "severity": null, "causal_leverage": null, "changeability": null}
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.setup_priority WHERE status = 'published'
);

-- Pin the seed publish. service_role may snapshot without an admin session.
INSERT INTO public.content_versions (created_by, created_by_email, snapshot)
SELECT
  NULL,
  'seed',
  jsonb_build_object(
    'metrics', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.metrics WHERE status = 'published'
    ), '{}'::jsonb),
    'bands', '{}'::jsonb,
    'faults', '{}'::jsonb,
    'fault_families', '{}'::jsonb,
    'symptom_map', '{}'::jsonb,
    'symptom_notes', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.symptom_notes WHERE status = 'published'
    ), '{}'::jsonb),
    'voice', '{}'::jsonb,
    'protocols', '{}'::jsonb,
    'setup_priority', coalesce((
      SELECT jsonb_object_agg(object_id::text, id::text)
      FROM public.setup_priority WHERE status = 'published'
    ), '{}'::jsonb)
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_versions WHERE created_by_email = 'seed'
);
