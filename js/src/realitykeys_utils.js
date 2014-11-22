var bitcoin = require('bitcoinjs-lib');
var conv = require('binstring'); // TODO: Can probably get this functionality from elsewhere
var crypto = bitcoin.crypto;

var ECPubKey = bitcoin.ECPubKey;
var ECKey = bitcoin.ECKey;
var TransactionBuilder = bitcoin.TransactionBuilder;
var scripts = bitcoin.scripts;
var networks = bitcoin.networks;
var BranchingBuilder = require('./../lib/branching_transaction_builder');
var Address = bitcoin.Address;
var BIP39 = require('bip39');
var BigInteger = require('bigi');

var assert = require('assert');

exports.format_fact_id = function(txt) {
    return parseInt(txt) + '';
}

exports.hex_for_claim_execution = function(to_addr, priv1, priv2, tx, c, network) {
    //console.log("making hex for output", tx);

    var tx = this.tx_for_claim_execution(to_addr, priv1, priv2, tx, c, network); 
    //console.log("realitykeys_utils.tx_for_claim_execution:", tx);
    var txHex =  tx.toHex();
    ////console.log(txHex);

    return txHex;

}

exports.tx_for_claim_execution = function(to_addr, priv1, priv2, tx, c, network) {

    // Find the right branch.
    // This should have both the keys.

    //console.log("in realitykeys_utils.tx_for_claim_execution", c);

    ////console.log(tx);
    var amount = tx['value'];

    //alert('Next step: make tx for '+n+','+txid+','+amount);
    var utxos2 = [
    {
        address: tx['address'],
        txid: tx['tx_hash_big_endian'],
        vout: tx['tx_output_n'],
        ts: 1396375187,
        scriptPubKey: tx['script'], // same for blockr and blockchain.info
        amount: amount / 100000000,
        confirmations: 1
    }
    ];
    //console.log("made utxos2", utxos2);

    var fee = 10000;
    //var opts = {network: bitcoin.networks[network], nreq:[2,2,2], pubkeys:pubkeys, fee: (fee)/100000000};
    ////console.log("opts", opts);

    outs = [{address:to_addr, amount:((amount-fee)/100000000)}];
    //console.log("outs", outs);
    //console.log("amount-fee", (amount-fee));
    ////console.log("outs:");
    //console.log("c_address", c['address']);
    ////console.log(outs);

    //var privs = [winner_privkey, 'HERE'];
    //var privs = [winner_privkey];
    ////console.log(winner_privkey);

    //console.log("create builder");
    var b = new bitcoin.TransactionBuilder();
    //console.log("addi input");
    b.addInput(utxos2[0]['txid'], 0);
    //console.log("addi output");
    b.addOutput(to_addr, (amount-fee));

    //console.log("outputs done, doing redeem sript thing");

    var multisig_redeem_script = this.redeem_script(c);
    var branching_builder = new BranchingBuilder(b);

    var user_wk = ECKey.fromWIF(priv1);
    var winner_wk = ECKey.fromWIF(priv2);

    var claim_privkeys = [ user_wk, winner_wk ];
    var claim_pubkeys = claim_privkeys.map( function(x) { return x.pub.toHex(); });

    var combos = [
        [ c['yes_user_pubkey'], c['yes_pubkey'] ],
        [ c['no_user_pubkey'], c['no_pubkey'] ],
        [ c['yes_user_pubkey'], c['no_user_pubkey'] ]
    ];

    var branch = -1;
    for (var i=0; i<combos.length; i++) {
        var combo = combos[i];
        var intersection = combo.filter(function(n) {
                return claim_pubkeys.indexOf(n) != -1
        });
        if (intersection.length == claim_privkeys.length) {
            branch = i;
            break;
        }
    }

    assert(branch >= 0);

    //console.log("claiming with branch pubkeys:", branch, claim_pubkeys);
    //var user_pubkeys = [ c['yes_user_pubkey'], c['no_user_pubkey'] ];

    //yes_pubkeys = yes_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
    claim_pubkeys = claim_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
    //user_pubkeys = user_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );

    //var combo1 = scripts.multisigOutput(2, yes_pubkeys);
    //console.log("getting winning_combo");
    var winning_combo = scripts.multisigOutput(2, claim_pubkeys);
    //var combo3 = scripts.multisigOutput(2, user_pubkeys);

    //console.log("selecting input branch");
    branching_builder.selectInputBranch(0, branch, combos.length);
    //b.sign([user_privkey_wif, winner_privkey_wif]);

    //console.log("signing branch");
    for (var i=0; i<claim_privkeys.length; i++) {
        branching_builder.signBranch(0, claim_privkeys[i], multisig_redeem_script, null, winning_combo)
    }

    //console.log("doing the build");
    var tx = branching_builder.build();
    //console.log("done the build", tx);

    //tx = b.build();
    return tx;

}

exports.p2sh_address = function(data) {

    if (!data['yes_user_pubkey']) return null;
    if (!data['no_user_pubkey']) return null;
    if (!data['yes_pubkey']) return null;
    if (!data['no_pubkey']) return null;
    //console.log("realitykeys_utils.p2sh_address", data);
    var script = this.redeem_script(data);

    var network = (data['network']) ? networks[data['network']] : networks['livenet'];

    //var addr = bitcore.Address.fromScript(script, data['network']);

    var scriptPubKey = bitcoin.scripts.scriptHashOutput(script.getHash());
    //console.log(scriptPubKey);
    var addr = bitcoin.Address.fromOutputScript(scriptPubKey, network).toString()


    return addr.toString();

}

exports.redeem_script = function(data) {

    var yes_pubkeys = [ data['yes_user_pubkey'], data['yes_pubkey'] ];
    var no_pubkeys = [ data['no_user_pubkey'], data['no_pubkey'] ];
    var user_pubkeys = [ data['yes_user_pubkey'], data['no_user_pubkey'] ];

    yes_pubkeys = yes_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
    no_pubkeys = no_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
    user_pubkeys = user_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );

    var combo1 = scripts.multisigOutput(2, yes_pubkeys);
    var combo2 = scripts.multisigOutput(2, no_pubkeys);
    var combo3 = scripts.multisigOutput(2, user_pubkeys);

    var branching_builder = new BranchingBuilder();
    branching_builder.addSubScript(combo1);
    branching_builder.addSubScript(combo2);
    branching_builder.addSubScript(combo3);

    var p2sh_script = branching_builder.script();
    //console.log("redeem script:");
    //console.log(p2sh_script);

    return p2sh_script;

}

exports.wins_on_for_stored_keys = function(c) {
    if (c == null) {
        return false;
    }
    if (stored_priv_for_pub(c['yes_user_pubkey'])) {
        return 'Yes';
    } else if (stored_priv_for_pub(c['no_user_pubkey'])) {
        return 'No';
    }  
    return 'None'
}

