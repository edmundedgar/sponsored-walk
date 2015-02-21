    var assert = require('assert');
    var settings = require('./settings');

    var BIP39 = require('bip39');

    var oracle_api_base = settings.oracle_base + '/api/v1';
    var oracle_view_base = settings.oracle_base + '/' + settings.realitykeys_api + '/';
    var oracle_param_string = '?accept_terms_of_service=current';

    var bitcoin_utils = require('./bitcoin_utils');
    var realitykeys_utils = require('./realitykeys_utils');
    var storage = require('./contract_storage');

    function save_contract(c, is_update, success_callback, fail_callback) {

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
            //console.log("store response", data);
        });


        //console.log("store: ",c);
        return;

    }

    function handle_user_key_update(k) {

        //console.log('handle_user_key_update', k);

        /*
        var check_key = ECKey.fromWIF(key_wif);
        var check_key_pub = check_key.pub;
        assert(k['pub'] == check_key_pub.toHex(), 'check key pub matches');
        */

        //$('#your-private-key').val(k['priv']);
        $('#your-private-key').val(k['priv']);
        $('#your-pub-key').val(k['pub']);
        update_key_form();

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
            //console.log('mnemonic_text empty');
            ng = true;
        } 

        var words;
        if (!ng) {
            words = mnemonic_text.split(' ');
            if (words.length != 12) {
                //console.log('mnemonic_text contains wrong number of words');
                ng = true;
            }
        }

        if (!ng && !BIP39.validateMnemonic(mnemonic_text)) {
                //console.log('mnemonic_text invalid');
                ng = true;
        }

        var k = null;
        if (!ng) {
            var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
            k = storage.load_stored_key(mnemonic_text) || bitcoin_utils.key_for_new_seed(seed);
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
			report_error('Invalid mnemonic.');
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
			report_error('Invalid mnemonic.');
            return false;
        }

        if (!BIP39.validateMnemonic(mnemonic_text)) {
            $('body').removeClass('mnemonic-created-and-confirmed');
			report_error('Invalid mnemonic.');
            return false;
        }

        var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
        var k = storage.load_stored_key(mnemonic_text) || bitcoin_utils.key_for_new_seed(mnemonic_text);

        $('body').addClass('mnemonic-created-and-confirmed');
        $('#your-private-key').val(k['priv']);
        $('#your-pub-key').val(k['pub']);

    }

    function reflect_contract_added(c) {

        //bootbox.alert('Please pay:<br />'+c['address']); 

        populate_contract_and_append_to_display(c);
        display_single_contract(c);

    }

    function execute_claim(to_addr, c, txes, user_privkey, winner_privkey, network, success_callback, failure_callback) {

        var i;

        if (txes.length == 0) {
            bootbox.alert('Could not find any funds to claim. Maybe they have already been claimed?');
            return false;
        }

        // TODO: This creates an outgoing transaction for each incoming transaction.
        // We should really make one single transaction for all of them.
        for (i=0; i < txes.length; i++) {
            
            var txHex = null;
            txHex = realitykeys_utils.hex_for_claim_execution(to_addr, user_privkey, winner_privkey, txes[i], c, network); 
            /*
            try {
                txHex = realitykeys_utils.hex_for_claim_execution(to_addr, user_privkey, winner_privkey, txes[i], c, network); 
            } catch (e) {
                //console.log("hex creation failed", e);
                continue;
            }
            */

            // For now our spending transaction is non-standard, so we have to send to eligius.
            // Hopefully this will be fixed in bitcoin core fairly soon, and we can use same the blockr code for testnet.
            // Presumably they do not support CORS, and we have to submit to their web form.
            // We will send our data by putting it in an iframe and submitting it.
            // We will not be able to read the result from the script, although we could make it visible to the user.
            if (network == 'livenet' && settings.pushtx_livenet == 'none') {
                //console.log('created but will not broadcast', txHex);
                return;
            } else {
                // this will always be testnet until the happy day when bitcore makes our transactions standard
                //var url = (network == 'testnet') ? 'https://tbtc.blockr.io/api/v1/tx/push' : 'https://btc.blockr.io/api/v1/tx/push';
                var url = null;
                var tx_data = {};
                var data_type = 'json';
                if (network == 'testnet') {
                    url = 'https://tbtc.blockr.io/api/v1/tx/push';
                    tx_data['hex'] = txHex;
                } else {
                    url = 'https://blockchain.info/pushtx?cors=true';   
                    tx_data['tx'] = txHex;
                    data_type = 'text';
                }
                $.ajax({
                    type: "POST",
                    url: url,
                    data: tx_data,
                    success: function( response ) {
                        //console.log(response);
                        if (network == 'testnet') {
                            var txid = response['data'];
                            c['claim_txid'] = txid;
                        }
                        success_callback(response);
                    },
                    error: function ( response ) {
                        failure_callback(response);
                        //console.log(response);
                    },
                    dataType: data_type, 
                });
            }
        }
    }

    function append_contract_to_display(c) {

        var section = $('#claim-table');

        // The address should uniquely identify the contract, so only ever add the same address once.
        if (section.find( "[data-address='" + c['address'] + "']").length) {
            return;
        }

        var row = section.find('.contract-data-template').clone().removeClass('contract-data-template').addClass('contract-data-row').attr('data-address',c['address']);

        row.find('.no-user-pub-key').val(c['no_user_pubkey']);
        row.find('.yes-user-pub-key').val(c['yes_user_pubkey']);
        row.find('.yes-pub-key').val(c['yes_pubkey']);
        row.find('.no-pub-key').val(c['no_pubkey']);
        row.find('.no-pub-key').val(c['no_pubkey']);
        row.find('.winner-privkey').val(c['winner_privkey']);
        row.find('.funding-address').val(c['address']);

        var lnk = $('<a>');
        lnk.attr('href', 'https://blockchain.info/address/' + bitcoin_utils.format_address(c['address']));
        lnk.text(bitcoin_utils.satoshis_to_display_format(c['balance']) + ' BTC');

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

        var url = c.network == 'testnet' ? 'https://tbtc.blockr.io/api/v1/address/balance/' + addr+'?confirmations=0' : 'https://btc.blockr.io/api/v1/address/balance/' + addr+'?confirmations=0';
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json', 
            success: function(data) {
                ////console.log("got response from blockchain");
                ////console.log(data);
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

        var url = oracle_api_base + '/' + settings.realitykeys_api + '/' + c['id'] + '/'+oracle_param_string
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

    function url_parameter_by_name(name) {
        var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    }

    function register_contract(params, success_callback, fail_callback) {

        $('body').addClass('registering-fact');
        params['use_existing'] = 1; // Always use the same keys if there are any matching these conditions
        var url = oracle_api_base + '/' + settings.realitykeys_api + '/new';
        var wins_on = 'Yes';

        var response;

        // Setting this hidden form field allows you to test with a di
        var override_with_fact_id = parseInt($('#override-with-existing-fact-id').val());

        var request_type = 'POST';
        if (override_with_fact_id > 0) {
            url = oracle_api_base + '/'+settings.realitykeys_api + '/' + override_with_fact_id + '/' + oracle_param_string
            request_type = 'GET';
            params = null;
        } 
        //console.log('Submitting to url');
        //console.log(url);
        //console.log(params);
        $.ajax({
            url: url, 
            type: request_type,
            data: params,
            dataType: 'json', 
        }).done(function(data) {
            //console.log('done');
            //console.log(data);
            success_callback(data);
            return true;
        }).fail( function(data) {
            //console.log('fail');
            //console.log(data);
            fail_callback(data);
            return false;
        }).always( function(data) {
            //console.log('always');
            $('body').removeClass('registering-fact');
            return true;
        });

        return false;

    }

    function handle_submit_create_reality_key_form(frm) {
        var params = {
            'accept_terms_of_service': 'current',
        };
	    frm.find('[data-realitykeys-api-param]').each( function() {
            params[$(this).attr('data-realitykeys-api-param')] = $(this).val();
	    });

        register_contract(
            params, 
            function(data) { 
                //console.log('ok!');
                //console.log(data);
                $('#title').text(data['title']);
                $('#reality-key-id').val(realitykeys_utils.format_fact_id(data['id']));
                $('#yes-pub-key').val(bitcoin_utils.format_pubkey(data['yes_pubkey']));
                $('#no-pub-key').val(bitcoin_utils.format_pubkey(data['no_pubkey']));
                var is_user_yes = ($('#your-pub-key').val() == data['yes_user_pubkey']); 
                var is_user_no = ($('#your-pub-key').val() == data['no_user_pubkey']); 
                var won_or_lost_class;
                if (data['winner'] != null) {
                    var is_user_winner = (is_user_no && data['winner'] == 'No') || (is_user_yes && data['winner'] == 'Yes');
                    won_or_lost_class = is_user_winner ? 'you-won' : 'you-lost';
                    $('body').addClass('winner-'+data['winner']);
                    $('body').addClass(won_or_lost_class);
                } else {
                    $('body').addClass('winner-unknown');
                }
                if (data['winner_privkey'] != null) {
                    $('#winner-privkey').val(bitcoin_utils.format_privkey(data['winner_privkey']));
                    $('body').addClass('settled');
                    $('body').addClass(won_or_lost_class);
                } else {
                    $('#winner-privkey').val('');
                    $('body').removeClass('settled');
                }
                update_key_form();
            },
            function(data) {
                report_error('Sorry, could not register the fact with Reality Keys. It may be temporarily unavilable. Please try again later');
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

        // If there's a value set on load, use that
        if ( frm.find('[name=settlement_date]').val() != '' ) {
            dt_str = frm.find('[name=settlement_date]').val();
        }

        frm.find('[name=settlement_date]')
            .val(dt_str)
            .datepicker({"dateFormat": 'yy-mm-dd' });
    }

    function setup_user_key_form(frm) {

        $('#remember-mnemonic-button').unbind('click').click( function() {
            var mnemonic_text = $('#mnemonic').val();
            //console.log("getting seed for", mnemonic_text);
            var seed = BIP39.mnemonicToSeedHex(mnemonic_text);
            var k = storage.load_stored_key(mnemonic_text) || bitcoin_utils.key_for_new_seed(seed);
            k['user_confirmed_ts'] = new Date().getTime();
            //console.log("store", k);
            if (!storage.store_key(mnemonic_text, k, true)) {
                return false;
            }
            //console.log("stored", k);

            $('body').addClass('mnemonic-stored');
        });

        $('#forget-mnemonic-button').unbind('click').click( function() {
            var mnemonic_text = $('#mnemonic').val();
            storage.delete_stored_key(mnemonic_text);
            $('body').removeClass('mnemonic-stored');
        });

        if (default_mnemonic = storage.default_stored_mnemnonic()) {
            $('#mnemonic').val(default_mnemonic);
            $('body').addClass('mnemonic-stored');
        } else {
            //console.log('not got key');
        } 

        $('#mnemonic').click( function(evt) {
            if (!frm.hasClass('show-mnemonic')) {
                frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
                $('#mnemonic').focus();
            }
        });

        $('#mnemonic-shadow').click( function(evt) {
            if (frm.hasClass('show-mnemonic')) {
                frm.removeClass('show-mnemonic').addClass('hide-mnemonic');
            } else {
                frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
                $('#mnemonic').focus();
            }
            $('#mnemonic').focus();
            evt.stopPropagation(); // only do whichever was first of click and focus
        });
        /*
        $('#mnemonic-shadow').focus( function(evt) {
            console.log('focus on mnemonic');
            if (frm.hasClass('show-mnemonic')) {
                console.log('show-mnemonic is on, hiding');
                frm.removeClass('show-mnemonic').addClass('hide-mnemonic');
            } else {
                frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
                console.log('show-mnemonic is off, showing');
                console.log('focusing mnemonic');
                $('#mnemonic').focus();
            }
            evt.stopPropagation(); // only do whichever was first of click and focus
        });
        $('#mnemonic').focus( function(evt) {
            console.log('focus on mnemonic');
            frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
            evt.stopPropagation(); // only do whichever was first of click and focus
        });
        */
        $('#show-mnemonic-link').click( function() {
            frm.addClass('show-mnemonic').removeClass('hide-mnemonic');
            $('#mnemonic').focus();
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
		return true;

    }

    function key_check(keys) {
        if (!keys['yes_user_pubkey']) return false;
        if (!keys['no_user_pubkey']) return false;
        if (!keys['yes_pubkey']) return false;
        if (!keys['no_pubkey']) return false;
        if (!keys['network']) return false;
        return true;
    }

    function update_funding_address() {

        if ($('body').hasClass('claim-page')) {
            return;
        }
        var network = $('#network').val();
        var c = {
            'yes_user_pubkey': $('#yes-user-pub-key').val(),
            'no_user_pubkey': $('#no-user-pub-key').val(),
            'yes_pubkey': $('#yes-pub-key').val(),
            'no_pubkey': $('#no-pub-key').val(),
            'id': $('#reality-key-id').val(),
            'network': network,
            'site_resource_id': $('#site-resource-id').val()
        };
        if (!key_check(c)) {
            $('#funding-address').val('');
			$('.address-check-form').removeClass('address-populated');
            return false;
        }
        //console.log('c:',c);
        var addr = realitykeys_utils.p2sh_address(c);
        c['address'] = addr; // used by store

        var offline = false;
        if (offline) {
            $('#funding-address').val(addr);
            handle_funding_address_update(addr);
        } else {
            if (addr != $('#funding-address').val(addr)) {
                // clea rthe funding address until we've made sure to sture the key data
                $('#funding-address').val(''); 
                $('.address-check-form').removeClass('address-populated');
                //$('body').removeClass('claimed').removeClass('settled').removeClass('you-won').removeClass('you-lost');
            }
            if (addr != '') {
                save_contract(
                    c, 
                    false, 
                    function(data) {
                        $('#funding-address').val(addr);
                        $('.address-check-form').addClass('address-populated');
                        handle_funding_address_update(addr);
                    },
                    function(data) {
                        $('#funding-address').val(''); 
                        $('.address-check-form').removeClass('address-populated');
						report_error('Unable to prepare the funding address - could not store keys.');
                        //console.log('storing contract failed', data);
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

        //console.log('Submitting to url');
        //console.log(url);
        //console.log(params);
        $.ajax({
            url: url, 
            type: request_type,
            data: params,
            dataType: 'json', 
        }).done(function(data) {
            //console.log('done');
            //console.log(data);
            success_callback(data);
            return true;
        }).fail( function(data) {
            //console.log('fail');
            //console.log(data);
            fail_callback(data);
            return false;
        }).always( function(data) {
            //console.log('always');
            $('body').removeClass('fetching-contract-data');
            return true;
        });

    }

    function setup_claim_multiple_form(frm) {

        var our_pub_key = $('#your-pub-key').val();
        if (our_pub_key == null) {
            //console.log('cannot set up claim form, our pub key not found');
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
                //console.log("got addresses:",addresses);
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
                    //console.log(addr_to_balance);
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
                                            //console.log('i won');
                                            //console.log(rk);
                                            append_contract_to_display(rk);
                                            available_to_claim_balance = available_to_claim_balance + rk['balance'];
                                        } else {
                                            //console.log('i lost');
                                            //console.log(rk);
                                            waiting_for_refund_balance = waiting_for_refund_balance + rk['balance'];
                                        } 
                                    } else {
                                        waiting_for_settlement_balance = waiting_for_settlement_balance + rk['balance'];
                                    }
                                        
                                                                }
                            }
                            $('#available-to-claim-balance').text(bitcoin_utils.satoshis_to_display_format(available_to_claim_balance));
                            $('#waiting-for-settlement-balance').text(bitcoin_utils.satoshis_to_display_format(waiting_for_settlement_balance));
                            $('#waiting-for-refund-balance').text(bitcoin_utils.satoshis_to_display_format(waiting_for_refund_balance));
                        }).fail( function(response) {
                        }).always( function(response) {
                        });
                    }

                }).fail( function(data) {
                    //console.log(data.responseText);
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

    function update_key_form() {
        var wins_on = $('win-on-yes').is(':checked') ? 'yes' : 'no';
        if (wins_on == 'yes') {
            $('#yes-user-pub-key').val($('#your-pub-key').val());
            $('#no-user-pub-key').val($('#counterparty-pub-key').val());
        } else {
            $('#yes-user-pub-key').val($('#counterparty-pub-key').val());
            $('#no-user-pub-key').val($('#your-pub-key').val());
        }
        update_funding_address();
    }

    function setup_make_address_form(frm) {
        $('#make-address-button').unbind('click').click( function() {
            update_funding_address();
            return false;
        });
        $('#counterparty-pub-key').change(update_key_form);
        $('#your-pub-key').change(update_key_form);
        $('#yes-pub-key').change(update_key_form);
        $('#no-pub-key').change(update_key_form);
        $('#network').change(update_key_form);

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
        //console.log("in show_address_balance", addr, network);

        var url_info = unspent_url_info(addr, network);;
        var url = url_info['url'];
        var response_format = url_info['response_format'];
            
        $.ajax({
            url: url, 
            type: 'GET',
            dataType: 'json'
        }).done( function(response) {
            var unspent_data = bitcoin_utils.format_unspent_response(response, response_format, addr);
            balance = bitcoin_utils.satoshis_to_display_format(unspent_data['balance']);
            $('#address-balance').text(balance);
        }).fail( function(data) {
            //console.log(data.responseText);
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
                'yes_user_pubkey': address_frm.find('.yes-user-pub-key').val(),
                'no_user_pubkey': address_frm.find('.no-user-pub-key').val(),
                'yes_pubkey': address_frm.find('.yes-pub-key').val(),
                'no_pubkey': address_frm.find('.no-pub-key').val(),
                'network': network
            };
            console.log("using keys to get p2sh: ",keys);
            var addr = realitykeys_utils.p2sh_address(keys);
            if (addr == null) {
                return false;
            }

            keys['address'] = addr;
            // Only check this on the main page, which has a funding-address field.
            if ($('#funding-address').length && $('#funding-address').val() != addr) {
                // Flip the keys if we were on the other side of this
                keys['yes_user_pubkey'] = address_frm.find('.your-pub-key').val(),
                keys['no_user_pubkey'] = address_frm.find('.our-pub-key').val(),
                addr = realitykeys_utils.p2sh_address(keys);
                keys['address'] = addr;
                if ($('#funding-address').length && $('#funding-address').val() != addr) {
                    alert('The addresses do not the match keys');
                    return false;
                }
            }

            var url_info = unspent_url_info(addr, network);;
            var url = url_info['url'];
            var response_format = url_info['response_format'];
            
            //console.log("fetching unspent:");
            $('body').addClass('fetching-balance-for-claim');
            $.ajax({
                url: url, 
                type: 'GET',
                dataType: 'json'
            }).done( function(response) {
                var data = bitcoin_utils.format_unspent_response(response, response_format, addr);
                //console.log("compare keys and addr", keys, addr);
                execute_claim(
                    withdraw_to_addr, 
                    keys, 
                    data['unspent_outputs'], 
                    $('#your-private-key').val(), 
                    claim_frm.find('.winner-privkey').val(), 
                    network, 
                    function(data) {
                        $('body').addClass('claimed');
						alert('Claim transaction sent. Please be patient, it may take a few hours to confirm.');
                    }, 
                    function(data) {
                        alert('Sending transaction failed.');
                    }
                    );
            }).fail( function(data) {
                //console.log("could not fetch");
                //console.log(data.responseText);
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

	function report_error(txt) {
		$('.error-display').text(txt).show();
		$('.error-display').delay(30000).fadeOut('slow');
	}

    exports.initialize_page = function() {

        if (!setup_user_key_form($('#user-key-form'))) {
			report_error('Error setting up user keys');
		}
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
        $('body').addClass('initialized');
        console.log('done init');

    }
