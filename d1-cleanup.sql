DELETE FROM link_visits WHERE link_id NOT IN (SELECT id FROM links);
DELETE FROM link_tags WHERE link_id NOT IN (SELECT id FROM links);
DELETE FROM links WHERE name LIKE '%111111%' OR name LIKE '%222222%' OR name LIKE '%333333%' OR name LIKE '%444444%' OR name LIKE '%åæåæ%';
