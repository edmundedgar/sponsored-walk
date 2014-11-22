<?php
/*
This is a very simple script to show how a dynamic page might put information into the page ready for Reality Keys to be created for it.
*/

// Pretend this is your database
// The keys are your IDs.
$db = array(
    98765 => array(
        // If the site gets all the "yes" funds, this will belong to the site.
        // If you allow different people to sign up and get funded for things on "yes", use their key
        'sponsored_pubkey' => '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e',
        //'setting_default_days_in_future' => '14', 
        'user_id' => '29908850',
        'activity' => 'walking',
        'measurement' => 'cumulative_distance',
        'goal' => '1000',
        'settlement_date' => '2014-11-25', 
        'objection_period_secs' => 1 * 60 * 60, 
        // You may want to leave this empty and leave the date field visible to allow the uesr to set it themselves.
        'title' => 'Edochan to walk 1km by November 25th, verified by GPS'
    ),
    98766=> array(
        'sponsored_pubkey' => '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e',
        //'setting_default_days_in_future' => '14', 
        'user_id' => '29908850',
        'activity' => 'walking',
        'measurement' => 'cumulative_distance',
        'goal' => '500',
        'settlement_date' => '2014-11-25', 
        'objection_period_secs' => 1 * 60 * 60, 
        'title' => 'Edochan to walk 500m by November 25th, verified by GPS'
    ),
    98768=> array(
        'sponsored_pubkey' => '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e',
        //'setting_default_days_in_future' => '14', 
        'user_id' => '29908850',
        'activity' => 'walking',
        'measurement' => 'cumulative_distance',
        'goal' => '500',
        'settlement_date' => '2014-11-27',
        'objection_period_secs' => 1 * 60 * 60, 
        'title' => 'Edochan to walk 500m by November 27th, verified by GPS'
    ),
    98771=> array(
        'sponsored_pubkey' => '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e',
        //'setting_default_days_in_future' => '14', 
        'user_id' => '29908850',
        'activity' => 'walking',
        'measurement' => 'cumulative_distance',
        'goal' => '5',
        'settlement_date' => '2014-11-23',
        'objection_period_secs' => 1 * 60 * 60, 
        'title' => 'Edochan to walk 5m by November 23rd, verified by GPS'
    ),
    98772=> array(
        'sponsored_pubkey' => '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e',
        //'setting_default_days_in_future' => '14', 
        'user_id' => '29908850',
        'activity' => 'walking',
        'measurement' => 'cumulative_distance',
        'goal' => '5000',
        'settlement_date' => '2014-11-23',
        'objection_period_secs' => 1 * 60 * 60, 
        'title' => 'Edochan to walk 5000m by November 23rd, verified by GPS'
    )
);

$id = intval($_GET['id']);
if ( !$id || !isset($db[$id]) ) {
    header("HTTP/1.0 404 Not Found");
    exit;     
}

print json_encode($db[$id]);