var assert = require('assert');

exports.store_contract = function(c, is_update, success_callback, fail_callback) {

    ////console.log("storing:");
    ////console.log(c);
    contract_store = {
        'contracts': {},
        'default': null
    }

    // We sometimes have a lot of data here - just store the bare minimum to recreate the contract
    var storeme = {};
    storeme['yes_user_pubkey'] = c['yes_user_pubkey'];
    storeme['no_user_pubkey'] = c['no_user_pubkey'];
    storeme['address'] = c['address'];
    storeme['id'] = c['id'];

    p2sh_addr = c['address'];
    contract_json_str = localStorage.getItem('contract_store');
    if (contract_json_str) {
        contract_store = JSON.parse(contract_json_str);
    }
    if (!is_update) {
        if (contract_store['contracts'][p2sh_addr]) {
            return; // Already there
        }
    }
    //contract_store['contracts'][p2sh_addr] = storeme;
    contract_store['contracts'][p2sh_addr] = c;
    contract_store['default'] = p2sh_addr;

    localStorage.setItem('contract_store', JSON.stringify(contract_store));

}

exports.is_contract_stored = function(p2sh_addr) {

    contract_json_str = localStorage.getItem('contract_store');
    if (!contract_json_str) {
        return false;
    }
    contract_store = JSON.parse(contract_json_str);
    if (contract_store['contracts'][p2sh_addr]) {
        return true; // Already there
    }
    return false;

}

exports.store_key = function(mnemonic_text, k) {

    ////console.log("storing:");
    ////console.log(k);
    var key_store = {
        'mnemonics': {},
        'default': null
    }

    var key_json_str = localStorage.getItem('key_store');
    if (key_json_str) {
        key_store = JSON.parse(key_json_str);
    }
    key_store['mnemonics'][mnemonic_text] = k;
    key_store['default'] = mnemonic_text;
    ////console.log(JSON.stringify(key_store));

    localStorage.setItem('key_store', JSON.stringify(key_store));
    return true;

}

exports.stored_priv_for_pub = function(pub) {

    var key_json_str = localStorage.getItem('key_store');
    if (key_json_str == '') {
        return null;
    }
    key_store = JSON.parse(key_json_str);
    mnemonics = key_store['mnemonics'];
    for (var m in mnemonics) {
        if (!mnemonics.hasOwnProperty(m)) {
            continue;
        }
        var k = mnemonics[m];
        if (k['pub'] == pub) {
            return k['priv'];
        }
        //console.log("no match for pub ",pub, k['pub']);
        ////console.log("no match for "+pub+": "+k['pub']);
        ////console.log(k);
    }
    return null;

}

exports.default_stored_mnemnonic = function() {
    key_json_str = localStorage.getItem('key_store');
    if (key_json_str) {
        var key_store = JSON.parse(key_json_str);
        return key_store['default'];
    }
    return null;

}

exports.delete_stored_key = function(mnemonic) {

    key_json_str = localStorage.getItem('key_store');
    if (key_json_str) {
        var key_store = JSON.parse(key_json_str);
        //console.log('before: ',key_store['mnemonics']);
        delete key_store['mnemonics'][mnemonic];

        var others_left = false;
        for (sd in key_store['mnemonics']) {
            if (key_store['mnemonics'].hasOwnProperty(sd)) {
                others_left = true;
                break;
            }
        }
        if (others_left) {
            localStorage.setItem('key_store', JSON.stringify(key_store));
        } else {
            localStorage.removeItem('key_store');
        }
    }
    return null;

}

exports.load_stored_key = function(mnemonic) {
    key_json_str = localStorage.getItem('key_store');
    if (key_json_str) {
        ////console.log("got key store");
        var key_store = JSON.parse(key_json_str);
        if (key_store['mnemonics'][mnemonic]) {
            return key_store['mnemonics'][mnemonic];
        } 
    }
    return null;

}
