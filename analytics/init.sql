CREATE MATERIALIZED VIEW user_analytics AS
SELECT u.user_id,
    u.username,
    u.number as "Phone Number",
    u.current_profeciency_level,
    jsonb_agg(
        jsonb_build_object(
            'set_id',
            ucs.set_id,
            'set_name',
            fcs.set_name,
            'proficiency_level',
            fcs.proficiency_level,
            'test_status',
            ucs.test_status
        )
        ORDER BY ucs.set_id
    )
FROM app_user u
    LEFT JOIN user_chapter_submissions ucs on u.user_id = ucs.user_id
    LEFT JOIN flash_card_set fcs on ucs.set_id = fcs.set_id
WHERE u.current_profeciency_level = fcs.proficiency_level
    AND u.role = 'user'
GROUP BY u.user_id;
CREATE UNIQUE INDEX user_analytics_index ON user_analytics (user_id);