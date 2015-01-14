var bitcoin = require('bitcoinjs-lib');
var conv = require('binstring'); // TODO: Can probably get this functionality from elsewhere
var crypto = bitcoin.crypto;

var ECPubKey = bitcoin.ECPubKey;
var ECKey = bitcoin.ECKey;
var TransactionBuilder = bitcoin.TransactionBuilder;
var scripts = bitcoin.scripts;
var BranchingBuilder = require('./../lib/branching_transaction_builder');
var Address = bitcoin.Address;
var BIP39 = require('bip39');
var BigInteger = require('bigi');

var assert = require('assert');



exports.format_pubkey = function(txt) {
    txt = txt.toLowerCase();
    // TODO: If passed uncompressed keys, compress them instead of failing
    if (/[0-9a-f]{66}/.test(txt)) {
        return txt;
    } else {
        return null;
    }
}

exports.format_privkey = function(txt) {
    if (/^[0-9a-zA-Z]+$/.test(txt)) {
        return txt;
    } else {
        return null;
    }
}

exports.format_network = function(txt) {
    if (txt == 'testnet') {
        return 'testnet';
    }
    if (txt == 'livenet') {
        return 'livenet';
    }
    return null;
}

exports.satoshis_to_display_format = function(satoshis) {
    return satoshis / 100000000;
}

exports.format_address = function(txt) {
    // NB We allow any prefix to allow for various alt-coins and things
    if (/[0-9A-Za-z]{20,40}/.test(txt)) {
        return txt;
    } else {
        return null;
    }
}

// We use blockr for testnet and blockchain.info for livenet.
// These return unspent outputs in different formats, reformat for what we need
exports.format_unspent_response = function(response, format, addr) {

    var ret = {
            'balance': 0,
            'unspent_outputs': []
    };
    if (format == 'blockr') {
        var data = response['data'];

        // Unspent with only one argument returns an object
        if (data.hasOwnProperty('address')) {
            data = [data];
        }
        for(var i=0; i<data.length; i++) {
            for (var j=0; j<data[i]['unspent'].length; j++) {
                var o_in = data[i]['unspent'][j];
                var o_out = {
                    'tx_hash_big_endian': o_in['tx'],
                    'value': o_in['amount'] * 100000000,
                    'tx_output_n': o_in['n'],
                    'script': o_in['script'],
                    'address': addr
                }
                ret['unspent_outputs'].push(o_out);
                ret['balance'] = ret['balance'] + o_out['value'];
            }
        }
    } else {
        var data = response['unspent_outputs'];
        for(var i=0; i<data.length; i++) {
            var o_in = data[i];
            var o_out = {
                'tx_hash_big_endian': o_in['tx_hash_big_endian'],
                'value': o_in['value'],
                'tx_output_n': o_in['tx_output_n'],
                'script': o_in['script'],
                'address': addr
            }
            ret['unspent_outputs'].push(o_out);
            ret['balance'] = ret['balance'] + o_out['value'];
        }
    }
    return ret; 

}

exports.key_for_new_seed = function(seed) {
    var privateKey = crypto.sha256(seed).toString('hex');
    var key_buffer = conv(privateKey, {in: 'hex', out: 'buffer'});
    var big_integer = BigInteger.fromBuffer(key_buffer);
    var key = new ECKey(big_integer, true);
    return {
        'seed': seed,
        'version': '1.0',
        'priv': key.toWIF(),
        'pub': key.pub.toHex(),
        'user_confirmed_ts': null
    };
}

