
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
    var BIP39 = require('bip39');
    var BigInteger = require('bigi');

    var oracle_api_base = settings.oracle_base + '/api/v1';
    var oracle_view_base = settings.oracle_base + '/runkeeper/';
    var oracle_param_string = '?accept_terms_of_service=current';
    var runkeeper_profile_base = 'http://www.runkeeper.com/user';

    function assert(val, description) {
        if (!val) {
            console.log("ASSERT FAIL: "+description);
        }
    }

    function runkeeper_url(profile) {
        return runkeeper_profile_base + '/' + profile;
    }

    // Return sanitized pubkey, or null if it doesn't look like a proper pubkey
    // TODO: If we get uncompressed stuff here, compress it.
    function format_pubkey(txt) {
        txt = txt.toLowerCase();
        // TODO: If passed uncompressed keys, compress them instead of failing
        if (/[0-9a-f]{66}/.test(txt)) {
            return txt;
        } else {
            return null;
        }
    }

    function satoshis_to_display_format(satoshis) {
        return satoshis / 100000000;
    }

    function format_fact_id(txt) {
        return parseInt(txt) + '';
    }

    function format_address(txt) {
        // NB We allow any prefix to allow for various alt-coins and things
        if (/[0-9A-Za-z]{20,40}/.test(txt)) {
            return txt;
        } else {
            return null;
        }
    }

    function test_format_sanitization() {

        var addr = format_address('thing%thing');
        assert((addr == null), 'script tags addr format to null');
        assert((format_address('1923abcdez92') == null) , 'base 58 check less than 20 chars fails');
        var valid_addr = '01234567891232323201234567892323232';
        assert(valid_addr == format_address(valid_addr) , 'base 58 check returns orig address if pattern generally ok');
        assert(format_pubkey('abcdj') == null, 'pubkey with non-hex characters returns null' );

        assert(format_pubkey('A0B0C0D0E0') == null, 'pubkey with non-hex characters returns null' );
        var valid_pubkey = '02d8cb2a0ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28';
        assert(valid_pubkey == format_pubkey(valid_pubkey), 'valid pubkey returns sanitized identically');

        assert(valid_pubkey == format_pubkey('02D8CB2A0Ea3cadc894d19081fb241723f0a69c3819b035d0ae587a11849ba9b28'), 'capital letters in hex come back lower-cased');

    }

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

    function test_transaction_cycle() {

        var yes_user_mnemonic = 'spider bus panic airport daring iron gloom current prize bonus witness hair';
        var yes_user_seed = BIP39.mnemonicToSeedHex(yes_user_mnemonic);
        var yes_user_privkey_obj = key_for_new_seed(yes_user_seed);
        var yes_user_privkey = yes_user_privkey_obj['priv']
        var yes_user_pubkey = yes_user_privkey_obj['pub']
        assert(yes_user_pubkey == '02f3a32b55520c115cc61860066c8280d0adbb471abe5b89e0b5e864948a34961e', 'Yes user pubkey as expected');;

        var no_user_mnemonic = 'apology dove vessel defy apology unusual piano flush health polar bleak report';
        var no_user_seed = BIP39.mnemonicToSeedHex(no_user_mnemonic);
        var no_user_key_obj = key_for_new_seed(no_user_seed);
        var no_user_privkey = no_user_key_obj['priv'];
        var no_user_pubkey = no_user_key_obj['pub'];
        assert(no_user_pubkey == '0247e6c3a88d76ab7505c147e5a9bcf0011226f7690081dd728042831f90a391ed', 'No user pubkey as expected');

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

        // old method with only the two groups and no user+user unlocking
        //var c243t_fund_address = p2sh_address(c243t, false);
        //assert('2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU' == c243t_fund_address, 'fact 243 gives us the expected funding address');

        c243t_fund_address = p2sh_address(c243t);
        assert('2N18JYb5iuyjHqi3c8fwGQwVzntvYTH99Mk' == c243t_fund_address, 'fact 243 gives us the expected funding address with the extra user-user branch on testnet');

        // mainnet version of the same thing
        var c243m = c243t;
        c243m['network'] = 'livenet';
        var c243m_fund_address = p2sh_address(c243m)
        c243m['address'] = c243m_fund_address;
        assert(c243m_fund_address != c243t_fund_address, 'Without testnet flag p2sh address is different to testnet version');
        assert('39a6Ur9hJXDwdvR4TYKPnzWjaYiNfZ4Zxp' == c243m_fund_address, 'fact 243 gives us the expected funding address with the extra user-user branch on livenet');
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

        var demo_unspent_txes = format_unspent_response(demo_unspent_blockchain, 'blockchain', c243m_fund_address);
        assert(demo_unspent_txes['unspent_outputs'].length == 1, 'demo_unspent_txes has 1 entry');
        assert(demo_unspent_txes['balance'] == 40000, 'demo_unspent_txes has the appropriate balance');
        var c243m_tx_hex = hex_for_claim_execution(cash_out_address, no_user_privkey, c243m['winner_privkey'], demo_unspent_txes['unspent_outputs'][0], c243m, 'livenet');
        return;
        var c243t_tx_hex_2 = hex_for_claim_execution(cash_out_address, yes_user_privkey, c243t['winner_privkey'], demo_unspent_txes['unspent_outputs'][0], c243t, 'testnet');
        assert(c243t_tx_hex != c243t_tx_hex_2, 'Hex should be different each time, due to randomness in signatures');

        var c243t_tx = tx_for_claim_execution(cash_out_address, yes_user_privkey, c243t['winner_privkey'], demo_unspent_txes[0], c243t);
        var chunks = c243t_tx['ins'][0].getScript().chunks;
        assert(0 == chunks[0].toString(), 'sig starts with an OP_0 for a buggy CHECK_MULTISIG to munch on');
        assert(chunks[1].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(chunks[2].toString('hex').length > 50, 'first sig > 50 chars (TODO: when lib gets deterministic k, check expected val');
        assert(81 == chunks[3].toString(), 'after sigs we have a 1');
        assert(81 == chunks[4].toString(), 'after sigs we have another 1 for the first branch');
        assert(chunks[5].toString('hex').length > 100, 'ends with a big old redeem script');
        
        /*
        TODO: Work out how to propagate the errors for this
        try {
            var c243t_tx_hex_wrong = hex_for_claim_execution(cash_out_address, no_user_privkey, c243t['winner_privkey'], demo_unspent_txes[0], c243t);
console.log(c243t_tx_hex_wrong);
            assert(false, 'Trying to claim with the wrong key combination should raise an error');
        } catch( err) {
            assert(true, 'Trying to claim with the wrong key combination should raise an error');
        }
        */


        var c243t_tx_user = tx_for_claim_execution(cash_out_address, yes_user_privkey, no_user_privkey, demo_unspent_txes[0], c243t);
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
        //var c252t_fund_address = p2sh_address(c252t, false);
        //assert('2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU' == c252t_fund_address, 'fact 252 gives us the expected funding address');

        c252t_fund_address = p2sh_address(c252t);
        assert('2Mtr3ge4kcA8rffWQdwfkcEYfuzyZJ956A2' == c252t_fund_address, 'fact 252 gives us the expected funding address with the extra user-user branch');
        assert(c243t_fund_address != c252t_fund_address, 'Yes fact produces a different funding address to a different no fact');

        // mainnet version of the same thing
        var c252t_tx_hex = hex_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
        var c252t_tx_hex_2 = hex_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
        assert(c252t_tx_hex != c252t_tx_hex_2, 'Hex should be different each time, due to randomness in signatures');

        var c252t_tx = tx_for_claim_execution(cash_out_address, no_user_privkey, c252t['winner_privkey'], demo_unspent_txes[0], c252t);
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

    function test_format_unspent_response() {
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
        var data = format_unspent_response(demo_unspent_blockr, 'blockr', '2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU');
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
        var data = format_unspent_response(demo_unspent_blockchain, 'blockchain', '391ByYRP3ZGtizQt3XKc96T8xxLvzWj5Ec');
        assert(data['unspent_outputs'].length == 2, 'right number of outputs per address');
        assert(data['unspent_outputs'][0]['tx_hash_big_endian'] == "91b7684656c3ea3f8aa22bb5246721d691295c8b0813f40cba58b29268760d33", 'txid is called tx_hash_big_endian');
        assert(data['unspent_outputs'][0]['value'] == 20000, 'amount is returned in satoshis');
        assert(data['balance'] == 200000, 'balance is provided and in satoshis');

    }

    /*
    We use blockr for testnet and blockchain.info for livenet.
    These return unspent outputs in different formats, reformat for what we need
    */
    function format_unspent_response(response, format, addr) {

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


    function run_tests() {

        test_format_unspent_response();
        test_format_sanitization();
        test_hash_to_contract();
        test_mnemonic_handling();
        test_transaction_cycle();
        test_script_monkey_patches();
        console.log('All tests complete');

    }

    function store_contract(c, is_update, success_callback, fail_callback) {

        var url = settings.pubkey_record_store;
        $.ajax({
            url: url, 
            type: 'POST',
            dataType: 'json', 
            data: {
                'yes_user_pubkey': c['yes_user_pubkey'],
                'no_user_pubkey': c['no_user_pubkey'],
                'yes_pubkey': c['yes_pubkey'],
                'no_pubkey': c['no_pubkey'],
                'address': c['address'],
                'site_resource_id': c['site_resource_id'],
                'realitykeys_id': c['id'],
            }
        }).done( function(data) {
            if (data['status'] != 'success') {
                fail_callback(data);
                return;
            }
            success_callback(data);
        }).fail( function(data) {
            fail_callback(data);
            return;
        }).always( function(data) {
            console.log("store response", data);
        });


        console.log("store: ",c);
        return;

        //console.log("storing:");
        //console.log(c);
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

    function is_contract_stored(p2sh_addr) {

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

    function store_athlete(a) {

        athlete_store = {
            'athletes': {},
            'default': null
        }

        athlete_json_str = localStorage.getItem('athlete_store');
        if (athlete_json_str) {
            athlete_store = JSON.parse(athlete_json_str);
        }
        athlete_store['athletes'][a] = a;

        // Always set the most recently stored to the default
        athlete_store['default'] = a;

        localStorage.setItem('athlete_store', JSON.stringify(athlete_store));

    }

    // Return a hash of athlete names and true/false for default or not
    function load_athletes() {
       //console.log('loading a');
        athlete_json_str = localStorage.getItem('athlete_store');
        if (!athlete_json_str) {
            return [];
        }
        var athlete_store = JSON.parse(athlete_json_str);
        if (!athlete_store['athletes']) {
            return [];
        }
        var default_athlete = athlete_store['default'];
        ret = {};
        for (a in athlete_store['athletes']) {
            var is_default = (a == default_athlete); 
            ret[a] = is_default; 
        }
        return ret;

    }

    function load_default_athlete() {

        athletes = load_athletes();
        if (athletes.length == 0) {
            return null;
        }
        for (a in athletes) {
            if (athletes[a]) {
                return a;
            }
        }
        return null;

    }

    function store_key(mnemonic_text, k) {

        //console.log("storing:");
        //console.log(k);
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
        //console.log(JSON.stringify(key_store));

        localStorage.setItem('key_store', JSON.stringify(key_store));
        return true;

    }

    function stored_priv_for_pub(pub) {

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
            console.log("no match for pub ",pub, k['pub']);
            //console.log("no match for "+pub+": "+k['pub']);
            //console.log(k);
        }
        return null;

    }

    function default_stored_mnemnonic() {
        key_json_str = localStorage.getItem('key_store');
        if (key_json_str) {
            var key_store = JSON.parse(key_json_str);
            return key_store['default'];
        }
        return null;

    }

    function delete_stored_key(mnemonic) {

        key_json_str = localStorage.getItem('key_store');
        if (key_json_str) {
            var key_store = JSON.parse(key_json_str);
            console.log('before: ',key_store['mnemonics']);
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

    function load_stored_key(mnemonic) {
        key_json_str = localStorage.getItem('key_store');
        if (key_json_str) {
            //console.log("got key store");
            var key_store = JSON.parse(key_json_str);
            if (key_store['mnemonics'][mnemonic]) {
                return key_store['mnemonics'][mnemonic];
            } 
        }
        return null;

    }

    function handle_user_key_update(k) {

        console.log('handle_user_key_update', k);

        /*
        var check_key = ECKey.fromWIF(key_wif);
        var check_key_pub = check_key.pub;
        assert(k['pub'] == check_key_pub.toHex(), 'check key pub matches');
        */

        //$('#your-private-key').val(k['priv']);
        $('#your-private-key').val(k['priv']);
        $('#your-pub-key').val(k['pub']);
        update_funding_address();

    }

    function handle_mnemonic_change(inp, is_scripted) {

        /* 
        Possiblities:
        - empty mnemonic
        - invalid mnemonic
        - existing mnemonic
        - new mnemonic 
        */

        var ng = false;

        var mnemonic_text = inp.val();
        if (mnemonic_text == '') {
            console.log('mnemonic_text empty');
            ng = true;
        } 

        var words;
        if (!ng) {
            words = mnemonic_text.split(' ');
            if (words.length != 12) {
                console.log('mnemonic_text contains wrong number of words');
                ng = true;
            }
        }

        if (!ng && !BIP39.validateMnemonic(mnemonic_text)) {
                console.log('mnemonic_text invalid');
                ng = true;
        }

        var k = null;
        if (!ng) {
            var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
            k = load_stored_key(mnemonic_text) || key_for_new_seed(seed);
            if (k['user_confirmed_ts']) { 
                $('body').addClass('mnemonic-created-and-confirmed');
            } else if (!is_scripted) {
                // TODO: Check fi we confirmed it but then forgot it
                $('body').removeClass('mnemonic-created-and-confirmed');
            }
        }

        if (ng) {
            inp.addClass('mnemonic-invalid');
            $('#your-private-key').val('');
            $('#your-pub-key').val('');
            $('.public-key-display').hide();
            $('#confirm-mnemonic-button').attr('disabled', 'disabled');
        } else {
            handle_user_key_update(k);
            $('#confirm-mnemonic-button').removeAttr('disabled');
        } 

        return false;

    }

    function handle_mnemonic_confirm(inp) {

        var mnemonic_text = inp.val();
        var words = mnemonic_text.split(' ');
        if (words.length != 12) {
            $('body').removeClass('mnemonic-created-and-confirmed');
            return false;
        }

        if (!BIP39.validateMnemonic(mnemonic_text)) {
            $('body').removeClass('mnemonic-created-and-confirmed');
            return false;
        }

        var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
        var k = load_stored_key(mnemonic_text) || key_for_new_seed(mnemonic_text);

        $('body').addClass('mnemonic-created-and-confirmed');
        $('#your-private-key').val(k['priv']);
        $('#your-pub-key').val(k['pub']);

    }

    function reflect_contract_added(c) {

        //bootbox.alert('Please pay:<br />'+c['address']); 

        var url = sharing_url(c, false);
        $('#section3').attr('name', url);

        populate_contract_and_append_to_display(c);
        display_single_contract(c);

    }

    function import_contracts(import_url) {
        var pubkey = $('#public-key').text();
        //var url = $('#import-contract-url').val() + pubkey;
        var url = import_url + pubkey;
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'text', 
            success: function(data) {
                var lines = data.split("\n");
                for (i=0; i<lines.length; i++) {
                    var l = lines[i];
                    if (l == '') {
                        continue;
                    }
                    var c = hash_to_contract('#' + l);
                    import_contract_if_required(c);
                }
            },
            error: function(data) {
                console.log("got error from load");
                console.log(data);
            }
        });
        return false;
    }

    function hash_to_contract(import_hash) {

        if (!/^#.*-.*-\d+-t?btc$/.test(import_hash)) {
            //console.log('import hash wrongly formatted, not even going to try to parse it');
            return null;
        }

        var url_parts = import_hash.split('#');

        var url_part = url_parts[1];
        var contract_data = url_part.split('-');

        // not an import
        if (contract_data.length != 4) {
            return false;
        }

        var yes_user_pubkey =  format_pubkey(contract_data[0]);
        var no_user_pubkey = format_pubkey(contract_data[1]);
        var fact_id = format_fact_id(contract_data[2]);
        var is_testnet = prefix_to_testnet_setting(contract_data[3]);

        if ( yes_user_pubkey == null || no_user_pubkey == null || fact_id == null) {
            return null;
        }

        var c = {};
        c['yes_user_pubkey'] = yes_user_pubkey;
        c['no_user_pubkey'] = no_user_pubkey;
        c['id'] = fact_id;
        c['is_testnet'] = is_testnet;

        return c;

    }

    function view_contract_if_in_hash(import_hash) {

console.log("import import_hash "+import_hash);
        var c = hash_to_contract(import_hash);
        if (c == null) {
            return false;
        }

        var url = sharing_url(c, false);
        $('#section3').attr('name', url);

        // Should already be this, but changing it now seems to force the page to jump properly
        document.location.hash = '#'+url;

        display_single_contract(c);
        $(document).scrollTop( $("#section3").offset().top );

        return false;

    }

    function charity_display_for_pubkey(pubkey) {
        var txt = $('#charity-select').find('[value='+pubkey+']').text();
        if (txt == '') {
            return pubkey;
        }
        return txt;
    }

    function charity_display_for_form() {
        var pubkey = $('#charity-select').val();
        if (pubkey == 'other') {
            pubkey = $('#charity-public-key').val();
        } 
        return charity_display_for_pubkey(pubkey);
    }

    function activity_verb(activity) {
        return $('#activity').find('option[value="'+activity+'"]').attr('data-verb');
    }

    // TODO: This ends up duplicating a lot with display_single_contract
    function import_contract_if_required(c) {

        var wins_on = wins_on_for_stored_keys(c);
        if (wins_on == 'None') {
            return false;
        }

        // Start populated with the data we have, fetch the rest
        data = c;

        // Make sure we have at least one of the keys
        url = oracle_api_base + '/fact/' + c['id'] + '/' + oracle_param_string;
        console.log("fetching reality keys data:");
        console.log(url);
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json', 
            success: function(data) {
                data['wins_on'] = wins_on;
                data['charity_display'] = charity_display_for_pubkey(c['no_user_pubkey']);
                data['yes_user_pubkey'] = c['yes_user_pubkey'];
                data['no_user_pubkey'] = c['no_user_pubkey'];
                data['is_testnet'] = c['is_testnet'];
                data['address'] = p2sh_address(data);

                if (is_contract_stored(data['address'])) {
                    return true;
                }

                store_contract(data);
                reflect_contract_added(data);
                $(document).scrollTop( $("#section3").offset().top );
            },
            error: function(data) {
                console.log("got error from fake");
                console.log(data);
            }
        });
        return false;

    }

    function wins_on_for_stored_keys(c) {
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

    // Return a nicely-formatted date, if the browser supports it
    // Otherwise just return which you sent us, which should by eg 2014-08-16
    function formatted_date(iso_date) {
        try {
            var dt = new Date(iso_date);
            var formatted = dt.toLocaleString('en-US', {weekday: "long", year: "numeric", month: "long", day: "numeric"});
            return formatted;
        } catch (e) { 
            return iso_date;
        }
    }


    function eligius_cross_domain_post(data) {

        // Some browsers sensibly refuse to do http posts from https pages
        // For now proxy eligius over https to work around this 
        // If helper.bymycoins.com goes away you may need to restore eligius and tinker with browser settings
        //var url = 'http://eligius.st/~wizkid057/newstats/pushtxn.php';
        var url = 'https://helper.bymycoins.com/pushnonstandardtx/pushtxn.php';

        var iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        iframe.style.display = "none";

        // Just needs a unique name, last 16 characters of tx hex should be ok
        var target_name = 'tx-' + data.substring(data.length-16, data.length); 
        iframe.contentWindow.name = target_name;

        // construct a form with hidden inputs, targeting the iframe
        var form = document.createElement("form");
        form.target = target_name;
        form.action = url;
        form.method = "POST";

        var tx_input = document.createElement("input");
        tx_input.type = "hidden";
        tx_input.name = 'transaction';
        tx_input.value = data
        form.appendChild(tx_input);

        var send_input = document.createElement("input");
        send_input.type = "hidden";
        send_input.name = 'send';
        send_input.value = 'Push' 
        form.appendChild(send_input);

        document.body.appendChild(form);
        form.submit();

    }

    function execute_claim(to_addr, c, txes, user_privkey, winner_privkey, network) {

        var i;

        if (txes.length == 0) {
            bootbox.alert('Could not find any funds to claim. Maybe they have already been claimed?');
            return false;
        }

        // TODO: This creates an outgoing transaction for each incoming transaction.
        // We should really make one single transaction for all of them.
        for (i=0; i < txes.length; i++) {
            
            var txHex = null;
            txHex = hex_for_claim_execution(to_addr, user_privkey, winner_privkey, txes[i], c, network); 
            /*
            try {
                txHex = hex_for_claim_execution(to_addr, user_privkey, winner_privkey, txes[i], c, network); 
            } catch (e) {
                console.log("hex creation failed", e);
                continue;
            }
            */
            console.log(txHex);

            // For now our spending transaction is non-standard, so we have to send to eligius.
            // Hopefully this will be fixed in bitcoin core fairly soon, and we can use same the blockr code for testnet.
            // Presumably they do not support CORS, and we have to submit to their web form.
            // We will send our data by putting it in an iframe and submitting it.
            // We will not be able to read the result from the script, although we could make it visible to the user.
            if (network == 'livenet' && settings.pushtx_livenet == 'none') {
                console.log('created but will not broadcast', txHex);
                return;
            } else if (network == 'livenet' && settings.pushtx_livenet == 'eligius') {
                eligius_cross_domain_post(txHex);
            } else {
                // this will always be testnet until the happy day when bitcore makes our transactions standard
                //var url = (network == 'testnet') ? 'https://tbtc.blockr.io/api/v1/tx/push' : 'https://btc.blockr.io/api/v1/tx/push';
                var url = null;
                var tx_data = {};
                if (network == 'testnet') {
                    url = 'https://tbtc.blockr.io/api/v1/tx/push';
                    tx_data['hex'] = txHex;
                } else {
                    url = 'https://blockchain.info/pushtx?cors=true';   
                    tx_data['tx'] = txHex;
                }
                $.ajax({
                    type: "POST",
                    url: url,
                    data: tx_data,
                    success: function( response ) {
                        console.log(response);
                        if (network == 'testnet') {
                            var txid = response['data'];
                            if (network == 'livenet' && settings.pushtx_livenet == 'both') {
                                // submit direct to eligius just to be sure...
                                eligius_cross_domain_post(txHex);
                            }
                            c['claim_txid'] = txid;
                            store_contract(c, true);
                        }
                    },
                    error: function ( response ) {
                        bootbox.alert('Sending transaction failed.');
                        console.log(response);
                    },
                    dataType: 'json', 
                });
            }
        }
    }

    function hex_for_claim_execution(to_addr, priv1, priv2, tx, c, network) {
        console.log("making hex for output", tx);

        var tx = tx_for_claim_execution(to_addr, priv1, priv2, tx, c, network); 
        console.log("tx_for_claim_execution:", tx);
        var txHex =  tx.toHex();
        //console.log(txHex);

        return txHex;

    }

    function tx_for_claim_execution(to_addr, priv1, priv2, tx, c, network) {

        // Find the right branch.
        // This should have both the keys.

console.log("in tx_for_claim_execution", c);

        //console.log(tx);
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
        console.log("made utxos2", utxos2);

        var fee = 10000;
        //var opts = {network: bitcoin.networks[network], nreq:[2,2,2], pubkeys:pubkeys, fee: (fee)/100000000};
        //console.log("opts", opts);

        outs = [{address:to_addr, amount:((amount-fee)/100000000)}];
        console.log("outs", outs);
        console.log("amount-fee", (amount-fee));
        //console.log("outs:");
        console.log("c_address", c['address']);
        //console.log(outs);

        //var privs = [winner_privkey, 'HERE'];
        //var privs = [winner_privkey];
        //console.log(winner_privkey);

        console.log("create builder");
        var b = new bitcoin.TransactionBuilder();
        console.log("addi input");
        b.addInput(utxos2[0]['txid'], 0);
        console.log("addi output");
        b.addOutput(to_addr, (amount-fee));

        console.log("outputs done, doing redeem sript thing");

        var multisig_redeem_script = redeem_script(c);
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

        console.log("claiming with branch pubkeys:", branch, claim_pubkeys);
        //var user_pubkeys = [ c['yes_user_pubkey'], c['no_user_pubkey'] ];

        //yes_pubkeys = yes_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
        claim_pubkeys = claim_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );
        //user_pubkeys = user_pubkeys.map( function(x) { return new ECPubKey.fromHex(x) } );

        //var combo1 = scripts.multisigOutput(2, yes_pubkeys);
        console.log("getting winning_combo");
        var winning_combo = scripts.multisigOutput(2, claim_pubkeys);
        //var combo3 = scripts.multisigOutput(2, user_pubkeys);

        console.log("selecting input branch");
        branching_builder.selectInputBranch(0, branch, combos.length);
        //b.sign([user_privkey_wif, winner_privkey_wif]);

        console.log("signing branch");
        for (var i=0; i<claim_privkeys.length; i++) {
            branching_builder.signBranch(0, claim_privkeys[i], multisig_redeem_script, null, winning_combo)
        }

        console.log("doing the build");
        var tx = branching_builder.build();
        console.log("done the build", tx);

        //tx = b.build();
        return tx;

    }

    function testnet_setting_to_prefix(is_testnet) {
        if (is_testnet) {
            return 'tbtc';
        } else {
            return 'btc';
        }
    }

    function prefix_to_testnet_setting(prefix) {
        return (prefix == 'tbtc');
    }

    function sharing_url(c, full) {
        var store = c['yes_user_pubkey']+'-'+c['no_user_pubkey']+'-'+c['id']+'-'+testnet_setting_to_prefix(c['is_testnet']);;
        var base = '';
        if (full) {
            base += document.URL;
            base = base.replace(/\?.*$/, "");
            base = document.URL.replace(/\#.*$/, "");
            base += '#';
        }
        return base + store;
    }

    function append_contract_to_display(c) {

        var section = $('#claim-table');

        // The address should uniquely identify the contract, so only ever add the same address once.
        if (section.find( "[data-address='" + c['address'] + "']").length) {
            return;
        }

        var row = section.find('.contract-data-template').clone().removeClass('contract-data-template').addClass('contract-data-row').attr('data-address',c['address']);

        row.find('.our-pub-key').val(c['no_user_pubkey']);
        row.find('.your-pub-key').val(c['yes_user_pubkey']);
        row.find('.yes-pub-key').val(c['yes_pubkey']);
        row.find('.no-pub-key').val(c['no_pubkey']);
        row.find('.no-pub-key').val(c['no_pubkey']);
        row.find('.winner-privkey').val(c['winner_privkey']);
        row.find('.funding-address').val(c['address']);

        var lnk = $('<a>');
        lnk.attr('href', 'https://blockchain.info/address/' + format_address(c['address']));
        lnk.text(satoshis_to_display_format(c['balance']) + ' BTC');

        row.find( "[data-type='funds']" ).html(lnk);
        //row.find( "[data-type='settlement_date']" ).text(c['settlement_date']);

        row.insertAfter('.contract-data-template:last');

        // Pass the row in twice because it contains both the address setup form fields and the claim form fields
        setup_claim_form(row, row);

        row.show();

    }

    function display_contracts() {

        var contract_json_str = localStorage.getItem('contract_store');
        if (contract_json_str) {
            var contract_store = JSON.parse(contract_json_str);
            for (addr in contract_store['contracts']) {
                c = contract_store['contracts'][addr];
                c = populate_contract_and_append_to_display(c);
            }
        }

    }

    function populate_contract_and_append_to_display(c) {

        // Get the status from blockchain and reality keys
        var addr = c['address'];
        if (!addr) {
            return false;
        }

        var url = c.is_testnet ? 'https://tbtc.blockr.io/api/v1/address/balance/' + addr+'?confirmations=0' : 'https://btc.blockr.io/api/v1/address/balance/' + addr+'?confirmations=0';
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json', 
            success: function(data) {
                //console.log("got response from blockchain");
                //console.log(data);
                c['balance'] = data['data']['balance'];
                populate_reality_key_and_append_to_display(c);
            },
            error: function(data) {
                c['load_error_funds'] = true;
                populate_reality_key_and_append_to_display(c);
            }
        });

    }

    function populate_reality_key_and_append_to_display(c) {

        var url = oracle_api_base + '/runkeeper/'+c['id']+'/'+oracle_param_string
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json', 
        }).fail( function(data) {
            c['load_error_fact'] = true;
        }).always( function(data) {
            $.extend(c, data);
            append_contract_to_display(c);
        });

    }

    function key_for_new_seed(seed) {
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

    function p2sh_address(data) {

        if (!data['yes_user_pubkey']) return null;
        if (!data['no_user_pubkey']) return null;
        if (!data['yes_pubkey']) return null;
        if (!data['no_pubkey']) return null;
console.log("p2sh_address", data);
        var script = redeem_script(data);

        //var addr = bitcore.Address.fromScript(script, data['network']);

        var scriptPubKey = bitcoin.scripts.scriptHashOutput(script.getHash());
        console.log(scriptPubKey);
        var addr = bitcoin.Address.fromOutputScript(scriptPubKey).toString()


        return addr.toString();

    }

    function redeem_script(data) {

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
        console.log("redeem script:");
        console.log(p2sh_script);

        return p2sh_script;

    }

    function update_submittable() {
        var ok = true;
        var user_id = $('#user').val();
        if ( (user_id == '') || ( $('#user').attr('data-validated-user-id') != user_id) ) {
            ok = false;
        }
        if (ok) {
            //$('#set-goal-submit').removeAttr('disabled');
            $('body').addClass('athlete-connected');
        } else {
            //$('#set-goal-submit').attr('disabled', 'disabled');
            $('body').removeClass('athlete-connected');
        }
        return true;
    }

    // Check the user is authenticated so Reality Keys can get at their data.
    // Once they are, set their username in the data-validated-user-id attribute.
    function validate_user( inpjq ) {
        var user_id = inpjq.val();
        if ( (user_id != '') && (inpjq.attr('data-validated-user-id') != user_id ) ) {
            var url = oracle_api_base + '/runkeeper/user-info-by-id/' + user_id;
            $.ajax({
                url: url, 
                type: 'GET',
                dataType: 'json', 
                success: function(data) {
                    if ( data['status'] == 'success' ) {
                        inpjq.attr('data-validated-user-id', data['data']['user_id']);
                        inpjq.attr('data-validated-user-profile', data['data']['profile']);
                        inpjq.attr('data-validated-user-name', data['data']['name']);
                        update_goal_text($('#set-goal-form'));
                    }
                    update_submittable();
                },
                error: function(data) {
                    update_submittable();
                }
            });
        } else {
            update_submittable();
        }
    }

    function url_parameter_by_name(name) {
        var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    }

    function select_to_icon(icon_class, attribute_name, selected_item) {
        $('.'+icon_class+':not([data-activity='+selected_item+'])').removeClass('selected');
        $('.'+icon_class+'[data-activity='+selected_item+']').addClass('selected');
    }

    function update_goal_text(frm) {
        frm.find('.activity-verb').text( $('#activity').find(':selected').attr('data-verb') );
        frm.find('.goal-text').text( $('#goal').val() + ' meters' );
        frm.find('.settlement-date-text').text( formatted_date($('#settlement_date').val()) );

        var charity_display = charity_display_for_form();
        frm.find('.charity-display-text').text( charity_display );

        var userjq = $('#user');
        var user = '';
        if ( userjq.attr('data-validated-user-id') == userjq.val() ) {
            user = userjq.attr('data-validated-user-name');
        }
        var user_text = ( user == '' ) ? '' : ', '+user+',';
        frm.find('.user-text').text( user_text );
        var contract_text = {
            'activity_verb': $('#activity').find(':selected').attr('data-verb'),
            'goal_text': $('#goal').val() + ' meters',
            'settlement_date': $('#settlement_date').val(),
            'charity_display': charity_display,
            'user': user
        }
        $('.contract-title-start').text(formatted_title_start(contract_text, false));
        $('.contract-title-end').text(formatted_title_end(contract_text, false));
    }

    function formatted_title_start(ct, past, tweet) {
        if (past) {
            txt = ct['user'] + ' swore';
            if (ct['total_received']) {
                txt += ' by ' + ct['total_received'] + ' BTC';
            } 
            txt += ' to ' + ct['activity_verb'] + ' ' + ct['goal_text'] + ' by '+formatted_date(ct['settlement_date']);  
            txt = txt.charAt(0).toUpperCase()+txt.substring(1); // capitalize first letter
            return txt;
        }
        var txt = tweet ? '@bymycoins I' : 'I';
        if (!tweet && ct['user'] != '') {
            txt += ', '+ct['user'] + ',';
        }
        txt += tweet ? ' swear' : ' swear by my coins';
        txt += ' to ' + ct['activity_verb'] + ' ' + ct['goal_text'] + ' by '+formatted_date(ct['settlement_date']);  
        return txt;
    }

    function formatted_title_end(ct, past, tweet) {
        if (tweet) {
            return ' or pay ' + ct['charity_display'];
        } else {
            return '...or they will go to ' + ct['charity_display'];
        }
    }

    function handle_set_goal_form_change() {
        update_goal_text($('#set-goal-form'));
    }

    function register_contract(params, success_callback, fail_callback) {

        $('body').addClass('registering-fact');
        params['use_existing'] = 1; // Always use the same keys if there are any matching these conditions
        var url = oracle_api_base + '/runkeeper/new';
        var wins_on = 'Yes';

        var response;
        var override_with_fact_id = parseInt($('#override-with-existing-fact-id').val());
        var request_type = 'POST';
        if (override_with_fact_id > 0) {
            url = oracle_api_base + '/runkeeper/'+override_with_fact_id+'/'+oracle_param_string
            request_type = 'GET';
            params = null;
        } 
        console.log('Submitting to url');
        console.log(url);
        console.log(params);
        $.ajax({
            url: url, 
            type: request_type,
            data: params,
            dataType: 'json', 
        }).done(function(data) {
            console.log('done');
            console.log(data);
            success_callback(data);
            return true;
        }).fail( function(data) {
            console.log('fail');
            console.log(data);
            fail_callback(data);
            return false;
        }).always( function(data) {
            console.log('always');
            $('body').removeClass('registering-fact');
            return true;
        });

        return false;

    }

    function handle_submit_create_reality_key_form(frm) {
        var params = {
            'user_id': frm.find('[name=user_id]').val(),
            'activity': $('[name=activity]').val(),
            'measurement': $('[name=measurement]').val(),
            'goal': $('[name=goal]').val(),
            'settlement_date': $('[name=settlement_date]').val(),
            'comparison': 'ge',
            'objection_period_secs': (24*60*60),
            'accept_terms_of_service': 'current',
        };
        register_contract(
            params, 
            function(data) { 
                console.log('ok!');
                console.log(data);
                $('#reality-key-id').val(data['id']);
                $('#yes-pub-key').val(data['yes_pubkey']);
                $('#no-pub-key').val(data['no_pubkey']);
                if (data['winner_privkey'] != null) {
                    $('#winner-privkey').val(data['winner_privkey']);
                    $('body').addClass('settled');
                }
                update_funding_address();
            },
            function(data) {
                bootbox.alert('Sorry, could not register the fact with Reality Keys.');
            }
        
        );
        return false;
    }

    function setup_reality_key_form(frm) {

        frm.submit( function() {
            return handle_submit_create_reality_key_form(frm);
        });

        // You can configure how far in the future you want to default the date to
        // If you don't we'll use 7
        var days = parseInt(frm.find('[name=setting_default_days_in_future]').val());
        days = days > 0 ? days : 7; 

        // Populate the date field to 1 week from now
        var dt = new Date();
        dt.setDate(dt.getDate() + days);
        var dt_str = dt.toISOString().slice(0, 10);
        frm.find('[name=settlement_date]')
            .val(dt_str)
            .datepicker({"dateFormat": 'yy-mm-dd' });
    }

    function setup_user_key_form(frm) {

        $('#remember-mnemonic-button').unbind('click').click( function() {
            var mnemonic_text = $('#mnemonic').val();
            console.log("getting seed for", mnemonic_text);
            var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
            var k = load_stored_key(mnemonic_text) || key_for_new_seed(seed);
            k['user_confirmed_ts'] = new Date().getTime();
            console.log("store", k);
            if (!store_key(mnemonic_text, k, true)) {
                return false;
            }
            console.log("stored", k);

            $('body').addClass('mnemonic-stored');
        });

        $('#forget-mnemonic-button').unbind('click').click( function() {
            var mnemonic_text = $('#mnemonic').val();
            delete_stored_key(mnemonic_text);
            $('body').removeClass('mnemonic-stored');
        });

        if (default_mnemonic = default_stored_mnemnonic()) {
            $('#mnemonic').val(default_mnemonic);
            $('body').addClass('mnemonic-stored');
        } else {
            console.log('not got key');
        } 

        $('#show-mnemonic-link').click( function() {
            frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
        });
        $('#hide-mnemonic-link').click( function() {
            frm.addClass('hide-mnemonic').removeClass('show-mnemonic');
        });

        if ($('#mnemonic').val() == '') {
            var mne = BIP39.generateMnemonic()
            $('#mnemonic').val(mne);
        }

        $('#mnemonic').change( function() {
            handle_mnemonic_change($('#mnemonic'), true);
        });

        $('#confirm-mnemonic-button').unbind('click').click( function() {
            handle_mnemonic_confirm($('#mnemonic'));
            return false;
        });

        // Always run the change handler on init.
        // This will toggle the body class to show if we're ready to do other stuff
        handle_mnemonic_change($('#mnemonic'));

    }

    function update_funding_address() {

        if ($('body').hasClass('claim-page')) {
            return;
        }
        var network = $('#network').val();
        var c = {
            'yes_user_pubkey': $('#our-pub-key').val(),
            'no_user_pubkey': $('#your-pub-key').val(),
            'yes_pubkey': $('#yes-pub-key').val(),
            'no_pubkey': $('#no-pub-key').val(),
            'id': $('#reality-key-id').val(),
            'network': network,
            'site_resource_id': $('#site-resource-id').val()
        };
        console.log('c:',c);
        var addr = p2sh_address(c);
        c['address'] = addr; // used by store

        var offline = false;
        if (offline) {
            $('#funding-address').val(addr);
            handle_funding_address_update(addr);
        } else {
            if (addr != $('#funding-address').val(addr)) {
                // clea rthe funding address until we've made sure to sture the key data
                $('#funding-address').val(''); 
            }
            if (addr != '') {
                store_contract(
                    c, 
                    false, 
                    function(data) {
                        $('#funding-address').val(addr);
                        handle_funding_address_update(addr);
                    },
                    function(data) {
                        $('#funding-address').val(''); 
                        console.log('storing contract failed', data);
                    }
                );
            }
        }
        
    }

    function handle_funding_address_update(addr) {

        show_address_balance(addr, $('#network').val());

    }

    function fetch_contract_data_for_site_resource_id(site_resource_id, success_callback, fail_callback) {

        $('body').addClass('fetching-contract-data');
        var url = settings.pubkey_record_query;

        var response;
        var request_type = 'GET';
        var params = {'site_resource_id': site_resource_id}

        console.log('Submitting to url');
        console.log(url);
        console.log(params);
        $.ajax({
            url: url, 
            type: request_type,
            data: params,
            dataType: 'json', 
        }).done(function(data) {
            console.log('done');
            console.log(data);
            success_callback(data);
            return true;
        }).fail( function(data) {
            console.log('fail');
            console.log(data);
            fail_callback(data);
            return false;
        }).always( function(data) {
            console.log('always');
            $('body').removeClass('fetching-contract-data');
            return true;
        });

    }

    function setup_claim_multiple_form(frm) {

        var our_pub_key = $('#our-pub-key').val();
        if (our_pub_key == null) {
            console.log('cannot set up claim form, our pub key not found');
            return;
        }

        var site_resource_id = $('#site-resource-id').val();
        var network = $('#network').val();
        fetch_contract_data_for_site_resource_id(
            site_resource_id,
            function(data) {
                var reality_keys_to_addresses = {};
                var addresses = [];
                for(var i=0; i < data['data'].length; i++) {
                    var c = data['data'][i];
                    var a = c['address'];
                    var rkid = c['realitykeys_id'] + '';
                    if (!reality_keys_to_addresses[rkid]) {
                        reality_keys_to_addresses[rkid] = {};
                    }
                    addresses.push(a);
                    reality_keys_to_addresses[rkid][a] = {
                        'yes_user_pubkey': c['yes_user_pubkey'],
                        'no_user_pubkey': c['no_user_pubkey']
                    };
                }
                console.log("got addresses:",addresses);
                var url_info = unspent_url_info( addresses, network );
                var url = url_info['url'];
                var response_format = url_info['response_format'];

                $('body').addClass('fetching-balance-for-multiple-claim');
                    
                if ($('#network').val() != 'livenet') {
                    bootbox.alert('Multiple claim does not work on testnet');
                    return false;
                }
                var url = 'https://blockchain.info/multiaddr?cors=true&active=' + addresses.join('|');
                $.ajax({
                    url: url, 
                    type: 'GET',
                    dataType: 'json'
                }).done( function(response) {
                    var addrs = response['addresses'];
                    var addr_to_balance = {}
                    var total_paid = 0;

                    // Go through the addresses in the DB and throw away anything without a payment
                    // addr_to_balance will then contain only funded addresses
                    // TODO: We probably want to display spent addresses somewhere...
                    for (var i=0; i<addrs.length; i++) {
                        var a = addrs[i];
                        if (a['final_balance'] == 0) {
                            continue;
                        }
                        var ad = a['address'];
                        addr_to_balance[ad] = a['final_balance'];
                        total_paid = total_paid + a['final_balance'];
                    }
                    console.log(addr_to_balance);
                    $('#address-balance').html(total_paid/100000000);

                    if (total_paid > 0) {
                        funded_addresses_param = Object.keys(reality_keys_to_addresses).join(',');
                        $.ajax({
                            url: 'https://www.realitykeys.com/api/v1/facts/'+funded_addresses_param+'/?accept_terms_of_service=current',
                            type: 'GET',
                            dataType: 'json'
                        }).done( function(response_data) {
                            var waiting_for_refund_balance = 0;
                            var waiting_for_settlement_balance = 0;
                            var available_to_claim_balance = 0;
                            for (var i=0; i<response_data.length; i++) {
                                var rk = response_data[i];
                                var rkid = rk['id'];
                                var rk_addresses = reality_keys_to_addresses[rkid];
                                for( rk_addr in rk_addresses) {
                                    if (!rk_addresses.hasOwnProperty(rk_addr)) {
                                        continue;
                                    }
                                    rk['address'] = rk_addr;
                                    rk['balance'] = addr_to_balance[rk_addr];
                                    rk['yes_user_pubkey'] = rk_addresses[rk_addr]['yes_user_pubkey'];
                                    rk['no_user_pubkey'] = rk_addresses[rk_addr]['no_user_pubkey'];
                                    var i_won = (rk['winner'] == 'Yes' && rk['yes_user_pubkey'] == our_pub_key) || (rk['winner'] == 'No' && rk['no_user_pubkey'] == our_pub_key);
                                    if ( (rk['winner'] == 'Yes') || (rk['winner'] == 'No') ) {
                                        if (i_won) {
                                            console.log('i won');
                                            console.log(rk);
                                            append_contract_to_display(rk);
                                            available_to_claim_balance = available_to_claim_balance + rk['balance'];
                                        } else {
                                            console.log('i lost');
                                            console.log(rk);
                                            waiting_for_refund_balance = waiting_for_refund_balance + rk['balance'];
                                        } 
                                    } else {
                                        waiting_for_settlement_balance = waiting_for_settlement_balance + rk['balance'];
                                    }
                                        
                                                                }
                            }
                            $('#available-to-claim-balance').text(satoshis_to_display_format(available_to_claim_balance));
                            $('#waiting-for-settlement-balance').text(satoshis_to_display_format(waiting_for_settlement_balance));
                            $('#waiting-for-refund-balance').text(satoshis_to_display_format(waiting_for_refund_balance));
                        }).fail( function(response) {
                        }).always( function(response) {
                        });
                    }

                }).fail( function(data) {
                    console.log(data.responseText);
                    // With blockchain over 
                    $('#address-balance').html('0');
                }).always( function() {
                    $('body').removeClass('fetching-balance-for-multiple-claim');
                });
                return false;

            },
            function(data) {
                alert('ng');
            }
        );

    }

    function setup_make_address_form(frm) {
        $('#make-address-button').unbind('click').click( function() {
            update_funding_address();
            return false;
        });
        $('#our-pub-key').change(update_funding_address);
        $('#your-pub-key').change(update_funding_address);
        $('#yes-pub-key').change(update_funding_address);
        $('#no-pub-key').change(update_funding_address);
        $('#network').change(update_funding_address);

        return false;
    }

    function setup_check_form(frm) {

        $('#check-address').unbind('click').click( function() {
            var addr = $('#funding-address').val();    
            if (addr == '') {
                return false;
            }
            show_address_balance(addr, $('#network').val());
            return false;
        }); 

    }

    function unspent_url_info(addr, network) {

        var response_format = 'blockr';
        if (network == 'livenet') {
            if (settings.query_livenet == 'blockchain') {
                url = 'https://blockchain.info/unspent?cors=true&active='+addr; 
                response_format = 'blockchain';
            } else {
                url = 'https://btc.blockr.io/api/v1/address/balance/'+addr;    
                url = url + '?confirmations=0';
                url = url + '&unconfirmed=1'; // unspent seems to need both of these
            }
        } else {
            url = 'https://tbtc.blockr.io/api/v1/address/balance/'+addr;    
            url = url + '?confirmations=0';
            url = url + '&unconfirmed=1'; // unspent seems to need both of these
        }
        return {
            'url': url,
            'response_format': response_format
        }

    }

    function show_address_balance(addr, network) {

        $('body').addClass('fetching-balance');
        console.log("in show_address_balance", addr, network);

        var url_info = unspent_url_info(addr, network);;
        var url = url_info['url'];
        var response_format = url_info['response_format'];

        console.log("fetching unspent:");
        $('body').addClass('fetching-balance-for-claim');
            
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json'
        }).done( function(response) {
            var unspent_data = format_unspent_response(response, response_format, addr);
            balance = satoshis_to_display_format(unspent_data['balance']);
            $('#address-balance').text(balance);
        }).fail( function(data) {
            console.log(data.responseText);
            // With blockchain over 
            $('#address-balance').html('0');
        }).always( function() {
            $('body').removeClass('fetching-balance');
        });
        return false;

    }

    /*
    Attaches event handlers allowing claims.
    claim_frm should contain the address to withdraw to.
    address_frm should contain the keys needed to make the redeem script

    This will be used for a single form on the payment page.
    On the claim page each row will provide different forms.
    The claim page may use the same form to hold both sets of values, in which case it should be passed in twice.
    */
    function setup_claim_form(claim_frm, address_frm) {

        claim_frm.find('.claim-from-address').unbind('click').click( function( ) {
            var withdraw_to_addr = claim_frm.find('.withdraw-to-address').val();
            if (withdraw_to_addr == '') {
                return false;
            }

            var network = $('#network').val();
            // Recreate the address to make sure it matches the keys
            var keys = {
                'yes_user_pubkey': address_frm.find('.your-pub-key').val(),
                'no_user_pubkey': address_frm.find('.our-pub-key').val(),
                'yes_pubkey': address_frm.find('.yes-pub-key').val(),
                'no_pubkey': address_frm.find('.no-pub-key').val(),
                'network': network
            };
            console.log("using keys to get p2sh: ",keys);
            var addr = p2sh_address(keys);
            if (addr == null) {
                return false;
            }

            keys['address'] = addr;
            // Only check this on the main page, which has a funding-address field.
            if ($('#funding-address').length && $('#funding-address').val() != addr) {
                console.log("check addr was",$('#funding-address').val(),"but recreated addr was",addr,keys);
                bootbox.alert('The addresses do not the match keys');
                return false;
            }

            var url_info = unspent_url_info(addr, network);;
            var url = url_info['url'];
            var response_format = url_info['response_format'];
            
            console.log("fetching unspent:");
            $('body').addClass('fetching-balance-for-claim');
            $.ajax({
                url: url, 
                type: 'GET',
                dataType: 'json'
            }).done( function(response) {
                var data = format_unspent_response(response, response_format, addr);
                console.log("compare keys and addr", keys, addr);
                execute_claim(withdraw_to_addr, keys, data['unspent_outputs'], $('#your-private-key').val(), claim_frm.find('.winner-privkey').val(), network);
            }).fail( function(data) {
                console.log("could not fetch");
                console.log(data.responseText);
            }).always( function() {
                $('body').removeClass('fetching-balance-for-claim');
            });
            return false;
        });

    }

    function setup_advanced_toggle() {

        $('#show-advanced').click( function() {
            $('body').removeClass('hide-advanced');
            return false;
        });

        $('#hide-advanced').click( function() {
            $('body').addClass('hide-advanced');
            return false;
        });

    }

    function initialize_page() {

        setup_user_key_form($('#user-key-form'));
        setup_advanced_toggle();

        if ($('body').hasClass('claim-page')) {
            setup_claim_multiple_form();
        } else {
            setup_reality_key_form($('#create-reality-key-form'));
            setup_make_address_form($('#make-address-form'));
            setup_check_form($('#address-check-form'));
            setup_claim_form($('#claim-form'), $('#make-address-form'));
            handle_submit_create_reality_key_form($('#create-reality-key-form'));
        }
return;
        // Default the settlement date to 1 week from today
                //console.log("trying to load default key");
        $('body').addClass('initialized');

    }

    initialize_page();

