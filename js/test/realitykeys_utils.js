var BIP39 = require('bip39');
/*
var settings = require('./settings');

var bitcoin = require('bitcoinjs-lib');
var conv = require('binstring'); // TODO: Can probably get this functionality from elsewhere
var crypto = bitcoin.crypto;

var ECPubKey = bitcoin.ECPubKey;
var ECKey = bitcoin.ECKey;
var TransactionBuilder = bitcoin.TransactionBuilder;
var scripts = bitcoin.scripts;
var BranchingBuilder = require('./../lib/branching_transaction_builder');
var Address = bitcoin.Address;
var BigInteger = require('bigi');

var oracle_api_base = settings.oracle_base + '/api/v1';
var oracle_view_base = settings.oracle_base + '/runkeeper/';
var oracle_param_string = '?accept_terms_of_service=current';
*/

var assert = require('assert');

var bitcoin_utils = require('./../src/bitcoin_utils');
var realitykeys_utils = require('./../src/realitykeys_utils');

describe('Format Sanitization', function() {
    it('rejects addresses with illegal characters', function() {
        var addr = bitcoin_utils.format_address('thing%thing');
        assert((addr == null), 'script tags addr format to null');
        assert((bitcoin_utils.format_address('1923abcdez92') == null) , 'base 58 check less than 20 chars fails');
        var valid_addr = '01234567891232323201234567892323232';
        assert(valid_addr == bitcoin_utils.format_address(valid_addr) , 'base 58 check returns orig address if pattern generally ok');
    }),
    it('rejects pubkeys with illegal characters', function() {
        assert(bitcoin_utils.format_pubkey('abcdj') == null, 'pubkey with non-hex characters returns null' );
        assert(bitcoin_utils.format_pubkey('A0B0C0D0E0') == null, 'pubkey with non-hex characters returns null' );
        var valid_pubkey = '02d8cb2a0ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28';
        assert(valid_pubkey == bitcoin_utils.format_pubkey(valid_pubkey), 'valid pubkey returns sanitized identically');
        assert(valid_pubkey == bitcoin_utils.format_pubkey('02D8CB2A0Ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28'), 'capital letters in hex come back lower-cased');
    })
});

describe('Transaction Cycle', function() {
    var yes_user_mnemonic = 'spider bus panic airport daring iron gloom current prize bonus witness hair';
    var yes_user_seed = BIP39.mnemonicToSeedHex(yes_user_mnemonic);
    var yes_user_privkey_obj = bitcoin_utils.key_for_new_seed(yes_user_seed);
    var yes_user_privkey = yes_user_privkey_obj['priv']
    var yes_user_pubkey = yes_user_privkey_obj['pub']

    var no_user_mnemonic = 'apology dove vessel defy apology unusual piano flush health polar bleak report';
    var no_user_seed = BIP39.mnemonicToSeedHex(no_user_mnemonic);
    var no_user_key_obj = bitcoin_utils.key_for_new_seed(no_user_seed);
    var no_user_privkey = no_user_key_obj['priv'];
    var no_user_pubkey = no_user_key_obj['pub'];

    var cash_out_address = '1Dc8JwPsxxwHJ9zX1ERYo9q7NQA9SRLqbC';


    // The following are previously-settled Reality Keys runkeeper facts
    // The resulting object should be the same as what you would get if you fetched the json from the api
    // https://www.realitykeys.com/api/v1/runkeeper/243/?accept_terms_of_service=current
    var no_fact = {"no_pubkey": "0389688a084ff6f83c9ed3c91236e0f46d060cef32da23dfc6fc147fde6af9ca10", "user_profile": "edochan", "settlement_date": "2014-09-23", "objection_period_secs": 604800, "human_resolution_scheduled_datetime": null, "measurement": "total_distance", "evaluation_method": "ge", "is_user_authenticated": true, "objection_fee_satoshis_paid": 0, "machine_resolution_scheduled_datetime": "2014-09-23 00:00:00", "user_id": "29908850", "goal": "4000", "created_datetime": "2014-07-19 03:34:22", "winner": "No", "value": "4000", "id": 243, "source": "runkeeper", "yes_pubkey": "03d93547f38370b35471a8ee463b4245d6b1282a0feccce8e149c4ada76d32df1a", "activity": "running", "objection_fee_satoshis_due": 1000000, "user_name": "edochan", "winner_privkey": "L3MRgBTuEtfvEpwb4CcGtDm4s79fDR8UK1AhVYcDdRL4pRpsy686"};

    // https://www.realitykeys.com/api/v1/runkeeper/252/?accept_terms_of_service=current
    var yes_fact = {"no_pubkey": "0309fee1726ed80f80869951de4b77115b1be64b77317c80b1f5f09cc9a78c978d", "user_profile": "edochan", "settlement_date": "2014-07-19", "objection_period_secs": 86400, "human_resolution_scheduled_datetime": null, "measurement": "cumulative_distance", "evaluation_method": "ge", "is_user_authenticated": true, "objection_fee_satoshis_paid": 0, "machine_resolution_scheduled_datetime": "2014-07-19 00:00:00", "user_id": "29908850", "goal": "100", "created_datetime": "2014-07-19 03:54:33", "winner": "Yes", "value": "100", "id": 244, "source": "runkeeper", "yes_pubkey": "0309992b4062fc9cb29e681fef394f88182a49e31a6a859a10be38664603a43fe7", "activity": "walking", "objection_fee_satoshis_due": 1000000, "user_name": "edochan", "winner_privkey": "L3k6Qy7SYXSLs93Bcf7YfQJsjFeDy4oLgFuMtstfwZkFSAckEdwf"};



    // testnet contract for fact 243 (yes)
    var c243t = no_fact; // NB This will have more fields filled than we would have in reality
    c243t['yes_user_pubkey'] = yes_user_pubkey;
    c243t['no_user_pubkey'] = no_user_pubkey;
    c243t['network'] = 'testnet';

    c243t_fund_address = realitykeys_utils.p2sh_address(c243t);

    // mainnet version of the same thing
    var c243m = c243t;
    c243m['network'] = 'livenet';
    var c243m_fund_address = realitykeys_utils.p2sh_address(c243m)
    c243m['address'] = c243m_fund_address;
            // Normally we would pull the balance from blockchain.info.
    // We then use it to populate the balance field of the contract
    //c243t['balance'] = ;

    var demo_unspent_blockchain = {
        "unspent_outputs":[
            {
                "tx_hash":"0343d77440f7989eb828f884bd2d9d559c9525ea659eb27951525a2269225350",
                "tx_hash_big_endian":"50532269225a525179b29e65ea25959c559d2dbd84f828b89e98f74074d74303",
                "tx_index":69269456,
                "tx_output_n": 0,   
                "script":"a9145671e6049b22779f46a70a4ab6d927963f1faf3787",
                "value": 40000,
                "value_hex": "009c40",
                "confirmations":0
            }
          
        ]
    };

    var demo_unspent_txes = bitcoin_utils.format_unspent_response(demo_unspent_blockchain, 'blockchain', c243m_fund_address);

    var c243m_tx_hex = realitykeys_utils.hex_for_claim_execution(cash_out_address, no_user_privkey, c243m['winner_privkey'], demo_unspent_txes['unspent_outputs'][0], c243m, 'livenet');


    it('produces the expected keys from mnemonics', function() {
        assert(yes_user_pubkey == '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e', 'Yes user pubkey as expected');;
        assert(no_user_pubkey == '0247e6c3a88d76ab7505c147e5a9bcf0011226f7690081dd728042831f90a391ed', 'No user pubkey as expected');
    }),

    it('Creates the expected funding address on testnet', function() {
        assert('2N18JYb5iuyjHqi3c8fwGQwVzntvYTH99Mk' == c243t_fund_address, 'fact 243 gives us the expected funding address with the extra user-user branch on testnet');
    }),

    it('Creates the expected funding address on livenet', function() {
        assert(c243m_fund_address != c243t_fund_address, 'Without testnet flag p2sh address is different to testnet version');
        assert('39a6Ur9hJXDwdvR4TYKPnzWjaYiNfZ4Zxp' == c243m_fund_address, 'fact 243 gives us the expected funding address with the extra user-user branch on livenet');
    }),

    it('Formats our unspent outputs appropriately', function() {
        assert(demo_unspent_txes['unspent_outputs'].length == 1, 'demo_unspent_txes has 1 entry');
        assert(demo_unspent_txes['balance'] == 40000, 'demo_unspent_txes has the appropriate balance');
    })
})


/*
       return;
        var c243t_tx_hex_2 = realitykeys_utils.hex_for_claim_execution(cash_out_address, yes_user_privkey, c243t['winner_privkey'], demo_unspent_txes['unspent_outputs'][0], c243t, 'testnet');
        assert(c243t_tx_hex != c243t_tx_hex_2, 'Hex should be different each time, due to randomness in signatures');

        var c243t_tx = realitykeys_utils.tx_for_claim_execution(cash_out_address, yes_user_privkey, c243t['winner_privkey'], demo_unspent_txes[0], c243t);
        var chunks = c243t_tx['ins'][0].getScript().chunks;
        assert(0 == chunks[0].toString(), 'sig starts with an OP_0 for a buggy CHECK_MULTISIG to munch on');
        assert(chunks[1].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(chunks[2].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(81 == chunks[3].toString(), 'after sigs we have a 1');
        assert(81 == chunks[4].toString(), 'after sigs we have another 1 for the first branch');
        assert(chunks[5].toString('hex').length > 100, 'ends with a big old redeem script');
        
        //TODO: Work out how to propagate the errors for this
        //try {
        //    var c243t_tx_hex_wrong = realitykeys_utils.hex_for_claim_execution(cash_out_address, no_user_privkey, c243t['winner_privkey'], demo_unspent_txes[0], c243t);
        //console.log(c243t_tx_hex_wrong);
        //    assert(false, 'Trying to claim with the wrong key combination should raise an error');
        //} catch( err) {
        //    assert(true, 'Trying to claim with the wrong key combination should raise an error');
        //}

        var c243t_tx_user = realitykeys_utils.tx_for_claim_execution(cash_out_address, yes_user_privkey, no_user_privkey, demo_unspent_txes[0], c243t);
        var chunks = c243t_tx_user['ins'][0].getScript().chunks;
        assert(0 == chunks[0].toString(), 'sig starts with an OP_0 for a buggy CHECK_MULTISIG to munch on');
        assert(chunks[1].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(chunks[2].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(0 == chunks[3].toString(), 'after sigs we have a noop');
        assert(chunks[4].toString('hex').length > 100, 'ends with a big old redeem script');



        // testnet contract for fact 243 (yes)
        var c252t = no_fact; // NB This will have more fields filled than we would have in reality
        c252t['is_testnet'] = true;
        c252t['yes_user_pubkey'] = yes_user_pubkey;
        c252t['no_user_pubkey'] = no_user_pubkey;
        c252t['is_testnet'] = true;

        // old method with only the two groups and no user+user unlocking
        //var c252t_fund_address = realitykeys_utils.p2sh_address(c252t, false);
        //assert('2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU' == c252t_fund_address, 'fact 252 gives us the expected funding address');

        c252t_fund_address = realitykeys_utils.p2sh_address(c252t);
        assert('2Mtr3ge4kcA8rffWQdwfkcEYfuzyZJ956A2' == c252t_fund_address, 'fact 252 gives us the expected funding address with the extra user-user branch');
        assert(c243t_fund_address != c252t_fund_address, 'Yes fact produces a different funding address to a different no fact');

        // mainnet version of the same thing
        var c252t_tx_hex = realitykeys_utils.hex_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
        var c252t_tx_hex_2 = realitykeys_utils.hex_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
        assert(c252t_tx_hex != c252t_tx_hex_2, 'Hex should be different each time, due to randomness in signatures');

        var c252t_tx = realitykeys_utils.tx_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
        var chunks = c252t_tx['ins'][0].getScript().chunks;
        assert(0 == chunks[0].toString(), 'sig starts with an OP_0 for a buggy CHECK_MULTISIG to munch on');
        assert(chunks[1].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(chunks[2].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(0 == chunks[3].toString(), 'after sigs we have a 1');
        assert(81 == chunks[4].toString(), 'after sigs we have a 0 for the first branch');
        assert(chunks[5].toString('hex').length > 100, 'ends with a big old redeem script');
 
        //console.log("Made hex:");
        //console.log(c243t_tx_hex);

        // Sending this resulted in:
        // txid: '5b834f6c1d750f60deec7c83da918832d55f9c290429c838df734f9ed2a32a3c'
        // raw tx: '0100000001efc0e2c1179de276b4097849965752169383df565b57464df296832655c5ebde00000000fd2501004730440220795bf7bc4529f2ffcdd625d9eb2e3769b9ce3eee7cca2b0d6c868bbc1ea34dd502206dc62551a96f9c43f4e0eaa288db65a27efd9dc529c45b2d2485f1966ce205ca01473044022003fcb9e1eeac11fd4c1a2696cdcdc2f1f1e81e1501cc5d56113d18888986df800220290d43ce410bd445b3ea25916eb4799ed702dfb9394bf954442d13213c6523c601514c9163522103b1e8aba06d96273de138cb8f672ef93b3bdefd9dc18d6c038e4eb8a766778ad32103ef92fd0593af4e10de665d1b25703a76af84349becdf6830b290a010db83746052ae6752210213e0a3f741cd305571366ee3d30bfd819bd95b6f0d8dea0ee13a10dc3f6cf4e62103ead85d26a8339abffabe420a5cc23d9a12a0d005a7d248c80c0d43cf969236e352ae68ffffffff01301b0f00000000001976a9147906f703d0774e8f4b2fb0b716b6352e86687dfc88ac00000000'

    }
    /*

    function test_mnemonic_handling() {

        var mnemonic = BIP39.generateMnemonic() 
        var words = mnemonic.split(' ');

        //var mne = new Mnemonic(128);
        //var words = mne.toWords();
        //var mne_hex = mne.toHex();
        assert(words.length == 12, '128-bit mnemonic makes 12 words');
        return;

        var mne2 = new Mnemonic(128);
        var mne2_hex = mne2.toHex()

        assert( (mne_hex != mne2_hex), 'Mnemonic makes a different hex result every time');

        var fixed_words = ["love", "ache", "bother", "cross", "fought", "swim", "brave", "rare", "hey", "neither", "paint", "bought"];

        var fixed_hex = '19958d7ae02536984de76050569555c1';
        var fixed_mne = new Mnemonic(fixed_words);
        assert( fixed_mne.toHex() == fixed_hex, 'Mnemonic loaded from previous output returns the same hex as before');

        var round_trip_mne = seed_to_mnemonic(fixed_hex);
        assert( fixed_words.join(' ') == round_trip_mne.toWords().join(' '), 'Mnemonic can be recreated from seed');

        var dodgy_words = [
            'asdf1', 'asdf2', 'asdf3', 'asdf4', 'asdf5', 'asdf6', 'asdf7', 'asdf8', 'asdf9', 'asdf10', 'asdf11', 'asdf12'
        ];
        var dodgy_mne = new Mnemonic(dodgy_words);
        assert(('ffffffffffffffffffffffffffffffff' == dodgy_mne.toHex()), 'Fed words it does not understand Mnemonic returns ffffffffffffffffffffffffffffffff');
        
    }

    function test_hash_to_contract() {

        var a_pub = '02d8cb2a0ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28';
        var b_pub = '0254694936f88db742069686bd964020e3c453120044ae35fb2a91ed556b93e1e7';
        var fact_id = '2';

        assert(hash_to_contract('asdf') == null, 'Badly formatted hash returns null');

        var valid_hash = '#' + a_pub + '-' + b_pub + '-' + fact_id + '-' + 'tbtc';
        var c = hash_to_contract(valid_hash);
        assert(c != null, 'Valid hash produces non-null contract object');
        assert(c['yes_user_pubkey'] == a_pub, 'Item 1 in hash produces contract object with yes_user_pubkey');
        assert(c['no_user_pubkey'] == b_pub, 'Item 2 in hash produces contract object with no_user_pubkey');
        assert(c['id'] == fact_id, 'Item 3 produces contract object with correct fact id');
        assert(c['is_testnet'], 'Item 4 as tbtc produces is_testnet as true');

        var valid_hash_2 = '#' + a_pub + '-' + b_pub + '-' + fact_id + '-' + 'btc';
        var c2 = hash_to_contract(valid_hash_2);
        assert(!c2['is_testnet'], 'Item 4 as not tbtc produces is_testnet as false');

    }

    function test_script_monkey_patches() {

        var a_pub = new Buffer('02d8cb2a0ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28', 'hex');
        var yes_pub = new Buffer('02585eca9b441b0e17b12145f2d73ac7dd8da1eae7cdb4022db6b78f224db3bdc9', 'hex');
        var b_pub = new Buffer('0254694936f88db742069686bd964020e3c453120044ae35fb2a91ed556b93e1e7', 'hex');
        var no_pub = new Buffer('037545a3b495208ba67328773361ca5c0037352839d3c634251b540e91b61e0fd8', 'hex');

        var s = Script.createMultisigGroups( [2,2], [ [a_pub, yes_pub], [b_pub, no_pub] ], {}); 
        var chunks = s.chunks;
        assert(chunks.length == 13, '13 chunks in 2-grouip pattern');
        assert(chunks[0] == Opcode.map.OP_IF, 'chunk 0 OP_IF in 2-group pattern');
        assert(chunks[1] != Opcode.map.OP_IF, 'chunk 1 OP_IF in 2-group pattern');
        assert(chunks[chunks.length-1] == Opcode.map.OP_ENDIF, 'last chunk OP_ENDIF in 2-group pattern');

        var s = Script.createMultisigGroups( [2,2,2], [ [a_pub, yes_pub], [b_pub, no_pub], [yes_pub, no_pub] ], {}); 
        var chunks = s.chunks;
        //assert(chunks.length == 13, '13 chunks in 2/2 pattern');
        assert(chunks[0] == Opcode.map.OP_IF, 'chunk 0 OP_IF in 3-group pattern');
        assert(chunks[1] == Opcode.map.OP_IF, 'chunk 1 OP_IF in 3-group pattern');
        assert(chunks[chunks.length-1] == Opcode.map.OP_ENDIF, 'last chunk OP_ENDIF in 3-group pattern');

    }


    function test_bitcoin_utils.format_unspent_response() {
        var demo_unspent_blockr = {
            "status": "success",
            "data": {
                "address": "2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU",
                "unspent": [
                    {
                        "tx": "deebc555268396f24d46575b56df839316525796497809b476e29d17c1e2c0ef",
                        "amount": "0.01000000",
                        "n": 0,
                        "confirmations": 1,
                        "script": "a914728b52d98256323232481fa1eff352dfbcb2f78687"
                    },
                    {
                        "tx": "aaf895c26bd32b4fb575b878ad51b7d189edfdd425f95a8026c24de8d93b98c1",
                        "amount": "0.02000000",
                        "n": 1,
                        "confirmations": 1,
                        "script": "a914728b52d98256323232481fa1eff352dfbcb2f78687"
                    }
                ],
                "with_unconfirmed": true
            },
            "code": 200,
            "message": ""
        };
        var data = bitcoin_utils.format_unspent_response(demo_unspent_blockr, 'blockr', '2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU');
        console.log(data);
        assert(data['balance'] == (0.01000000 + 0.02000000) * 100000000, 'balance is returned per address in satoshis' );
        assert(data['unspent_outputs'].length == 2, 'right number of outputs per address');
        assert(data['unspent_outputs'][0]['tx_hash_big_endian'] == "deebc555268396f24d46575b56df839316525796497809b476e29d17c1e2c0ef", 'txid is called tx_hash_big_endian');
        assert(data['unspent_outputs'][0]['value'] == (0.01*100000000), 'amount is returned in satoshis');
        assert(data['unspent_outputs'][0]['address'] == '2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU', 'address is supplied as passed in');

        var demo_unspent_blockchain = {
                "unspent_outputs":[
                    {
                        "tx_hash":"330d766892b258ba0cf413088b5c2991d6216724b52ba28a3feac3564668b791",
                        "tx_hash_big_endian":"91b7684656c3ea3f8aa22bb5246721d691295c8b0813f40cba58b29268760d33",
                        "tx_index":68669031,
                        "tx_output_n": 1,   
                        "script":"a9143b4d47a33bb98347e6e7f200c64cbab64d08576687",
                        "value": 20000,
                        "value_hex": "4e20",
                        "confirmations":713
                    },
                    {
                        "tx_hash":"a03facd648062b60c2855ba1b8196d38297c213f7d3753e507e126bb67bed6fb",
                        "tx_hash_big_endian":"fbd6be67bb26e107e553377d3f217c29386d19b8a15b85c2602b0648d6ac3fa0",
                        "tx_index":69008291,
                        "tx_output_n": 0,   
                        "script":"76a9148a462b671791d0bfbd8fd0d3987f652258d06dd088ac",
                        "value": 180000,
                        "value_hex": "02bf20",
                        "confirmations":83
                    }
                  
                ]
            };
        var data = bitcoin_utils.format_unspent_response(demo_unspent_blockchain, 'blockchain', '391ByYRP3ZGtizQt3XKc96T8xxLvzWj5Ec');
        assert(data['unspent_outputs'].length == 2, 'right number of outputs per address');
        assert(data['unspent_outputs'][0]['tx_hash_big_endian'] == "91b7684656c3ea3f8aa22bb5246721d691295c8b0813f40cba58b29268760d33", 'txid is called tx_hash_big_endian');
        assert(data['unspent_outputs'][0]['value'] == 20000, 'amount is returned in satoshis');
        assert(data['balance'] == 200000, 'balance is provided and in satoshis');

    }
    */


    /*
    function run_tests() {

        test_bitcoin_utils.format_unspent_response();
        test_format_sanitization();
        test_hash_to_contract();
        test_mnemonic_handling();
        test_transaction_cycle();
        test_script_monkey_patches();
        console.log('All tests complete');

    }
    */

