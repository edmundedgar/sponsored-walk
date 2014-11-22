<?php
/*
Quick-and-dirty script to store and retreive information about contracts.
*/
define('PATH_TO_DB', '/tmp');
define('DB_FILE', 'contracts.sqlite');

$error = null;
$validation_fails = array(); 
$response_data = array();

$cmd_params = array(
    'store' => 'store',
    'query' => 'query'
);

// Fields managed and their validation rules
$fields = array(
    'yes_user_pubkey' => '/^[a-f0-9]+$/',
    'no_user_pubkey' => '/^[a-f0-9]+$/',
    'site_resource_id' => '/[a-z_\-0-9]+$/i', // Probably a numerical ID but you may want to use something else
    'realitykeys_id' => '/^[a-z_\-0-9]+$/i', // Currently a numerical ID but may turn into a hash in future
    'yes_pubkey' => '/^[a-f0-9]+$/', // Can also be queried from realitykeys
    'no_pubkey' => '/^[a-f0-9]+$/', // Can also be queried from realitykeys
    'address' => '/^[a-z0-9]+$/i', // Can also be calculated based on the contracts
    'created' => '/$\d+$/',
);

$cmd_param = isset($_REQUEST['cmd']) ? $_REQUEST['cmd'] : 'query';
if (!$cmd = $cmd_params[$cmd_param]) {
    $error = 'cmd not understood';
}

if (!$error && !extension_loaded("sqlite3")) {
    $error = 'Please install SQLite3, eg sudo apt-get install php5-sqlite';
}

if (!$error) {
    $db = new SQLite3(PATH_TO_DB.'/'.DB_FILE);
    $db->exec('CREATE TABLE contracts(
        yes_user_pubkey TEXT,
        no_user_pubkey TEXT,
        site_resource_id TEXT, 
        realitykeys_id TEXT, 
        yes_pubkey TEXT, 
        no_pubkey TEXT, 
        address TEXT, 
        created INTEGER
    );');
}

$input = ($cmd == 'store') ? $_POST : $_GET;

$data = array();
foreach($fields as $n => $v) {
    if (!isset($input[$n])) {
        continue;
    }
    if (!preg_match($fields[$n], $input[$n])) {
        $validation_fails[$n] = 'Must match pattern '.$fields[$n];
    } else {
        $data[$n] = $input[$n];
    }
}

if (count($validation_fails)) {
    $error = 'Invalid data';
}

if (!$error && !count($data)) {
    $error = 'No parameters';
    $validation_fails['parameters'] = $error;
}

/*
if (!$error) {
    if (!isset($data['yes_user_pubkey']) && !isset($data['no_user_pubkey'])) {
        $error = 'Missing parameters';
        $validation_fails['parameters'] = 'You must supply one or the other public key.';
    }
}
*/

if ($cmd == 'store') {
    
    $data['created'] = time();

    if (!$error && (count($data) != count($fields)) ) {
        $error = 'Missing parameters for storage';
        $is_validation_fail = true;
    }

    if (!$error) {

        $sql = 'INSERT INTO contracts (';

        $delim = '';
        foreach($data as $n => $v) {
            $sql .= $delim;
            $sql .= $n;
            $delim = ', ';
        }
        $sql .= ') ';
        $sql .= 'VALUES( ';

        $delim = '';
        foreach($data as $n => $v) {
            $sql .= $delim;
            $sql .= ':'.$n;
            $delim = ', ';
        }
        $sql .= ' ) ';

        $statement = $db->prepare($sql);
        foreach($data as $n => $v) {
            $statement->bindValue(':'.$n, $v);
        }

        if (!$statement->execute()) {
            $error = 'Database insert failed';
        }

    }

}

// Always respond by dumping the matching objects
// If we just stored this should return what we stored, but fetching back lets us make sure
if (!$error) {
    $sql = 'SELECT * FROM contracts where ';
    $delim = '';
    foreach($data as $n => $v) {
        $sql .= $delim;
        $sql .= $n . ' = :'.$n;
        $delim = ' AND ';
    }
    $statement = $db->prepare($sql);
    foreach($data as $n => $v) {
        $statement->bindValue(':'.$n, $v);
    }
    if (!$result = $statement->execute()) {
        $error = 'Could not fetch from database';
    }
    if (!$error) {
        while( $row = $result->fetchArray()) {
            $response_data[] = $row;
        }
    }
}

// Respond per the JSend standard
$response = new stdClass();
if ($error) {
    if (count($validation_fails)) {
        $response->status = 'fail';
        $response->data = $validation_fails;
    } else {
        $response->status = 'error';
        $response->message = $error;
    }
} else {
    $response->status = 'success';
    $response->data = $response_data;
}

print json_encode($response);
