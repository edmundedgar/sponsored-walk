var assert = require('assert');
var bitcoin_utils = require('./../src/bitcoin_utils');

describe('Unspent transaction reformatting', function() {

    it('Reformats blockr unspent transactions in the way we expect', function() {

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
        assert(data['balance'] == (0.01000000 + 0.02000000) * 100000000, 'balance is returned per address in satoshis' );
        assert(data['unspent_outputs'].length == 2, 'right number of outputs per address');
        assert(data['unspent_outputs'][0]['tx_hash_big_endian'] == "deebc555268396f24d46575b56df839316525796497809b476e29d17c1e2c0ef", 'txid is called tx_hash_big_endian');
        assert(data['unspent_outputs'][0]['value'] == (0.01*100000000), 'amount is returned in satoshis');
        assert(data['unspent_outputs'][0]['address'] == '2N3gsvXbFd5UmjPTwHy1gNyLQ8SXPqMVqrU', 'address is supplied as passed in');

    }),
    it('Reformats blockchain.info unspent transactions in the way we expect', function() {

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

    })
});
