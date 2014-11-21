var assert = require('assert');
var bitcoin = require('bitcoinjs-lib');

var scripts = bitcoin.scripts;

var ECPubKey = bitcoin.ECPubKey;
var ECSignature = bitcoin.ECSignature;
var Script = bitcoin.Script;
var Transaction = bitcoin.Transaction;
var TransactionBuilder = bitcoin.TransactionBuilder;
var ops = bitcoin.opcodes;

// You pass this a normal bitcoinjs-lib TransactionBuilder object.
// Then call BranchingTransactionBuilder methods for branching-related operations
// We'll get the inputs and any normal outputs from the TransactionBuilder you give us.
function BranchingTransactionBuilder(builder) {
  this.builder = builder;

  this.subscripts = [];

  // In TransactionBuilder these would be added when you do builder.sign() and kept with the signature
  // But we cheat and lie to the transaction object about what we're passing it
  // Keep track of these so we can switch them back in at the end
  this.inputRedeemScripts = {}; 
  this.inputBranches = {};

  // We arrange our branches in a tree of nested OP_IFs.
  // We only bother going up to 4 you'd probably hit script size limits anyhow
  this.IF_TREE_FLAGS = {
      1: [ [] ],
      2: [ [1],    [0] ],
      3: [ [1, 1], [1, 0], [0] ],
      4: [ [1, 1], [1, 0], [0, 1], [0, 0] ]
  }
}

// This is a slightly-modified copy of TransactionBuilder.sign()
// The difference is that as well as the redeemScript, we pass in a subscript
// The subscript is the bit between the OP_IF branches.
// This should look like one of the normal patterns that bitcoinjs-lib understands
BranchingTransactionBuilder.prototype.sign = function(builder, index, privKey, redeemScript, subscript, hashType) {
  assert(builder.tx.ins.length >= index, 'No input at index: ' + index)
  hashType = hashType || Transaction.SIGHASH_ALL

  var prevOutScript = builder.prevOutScripts[index]
  var prevOutType = builder.prevOutTypes[index]

  var scriptType, hash
  if (redeemScript) {
    prevOutScript = prevOutScript || scripts.scriptHashOutput(redeemScript.getHash())
    prevOutType = prevOutType || 'scripthash'

    assert.equal(prevOutType, 'scripthash', 'PrevOutScript must be P2SH')

    scriptType = scripts.classifyOutput(subscript)

    assert.notEqual(scriptType, 'scripthash', 'RedeemScript can\'t be P2SH')
    assert.notEqual(scriptType, 'nonstandard', 'RedeemScript not supported (nonstandard)')

    hash = builder.tx.hashForSignature(index, redeemScript, hashType)

  } else {
    prevOutScript = prevOutScript || privKey.pub.getAddress().toOutputScript()
    prevOutType = prevOutType || 'pubkeyhash'

    assert.notEqual(prevOutType, 'scripthash', 'PrevOutScript is P2SH, missing redeemScript')

    scriptType = prevOutType

    hash = builder.tx.hashForSignature(index, prevOutScript, hashType)
  }

  builder.prevOutScripts[index] = prevOutScript
  builder.prevOutTypes[index] = prevOutType

  if (!(index in builder.signatures)) {
    builder.signatures[index] = {
      hashType: hashType,
      pubKeys: [],
      redeemScript: subscript, // originally redeemScript,
      scriptType: scriptType,
      signatures: []
    }
  } else {
    assert.equal(scriptType, 'multisig', scriptType + ' doesn\'t support multiple signatures')
  }

  var input = builder.signatures[index]
  assert.equal(input.hashType, hashType, 'Inconsistent hashType')
  assert.deepEqual(input.redeemScript, subscript, 'Inconsistent redeemScript')

  var signature = privKey.sign(hash)
  builder.signatures[index].pubKeys.push(privKey.pub)
  builder.signatures[index].signatures.push(signature)

  builder.signatures[index] = input;

  return builder;
}

// We could almost do this:
// this.builder.sign(index, privKey, subscript, hashType);
// ...then rewrite the redeemScript in the signatures prior to calling build()
// Except that builder.sign wants to autoclassify the scriptType
// ...rather than letting us tell it.
BranchingTransactionBuilder.prototype.signBranch = function(index, privKey, redeemScript, hashType, subscript) {
    this.builder = this.sign(this.builder, index, privKey, redeemScript, subscript, hashType);
    this.inputRedeemScripts[index] = redeemScript;
}

BranchingTransactionBuilder.prototype.addSubScript = function(subscript) {
    this.subscripts.push(subscript)
}

// Put all the subscripts together in a branching script.
// The subscripts will be added in the order you addSubScript()ed them.
BranchingTransactionBuilder.prototype.script = function() {
    var asms = [];
    for (var i=0; i<this.subscripts.length; i++) {
        var a = this.subscripts[i].toASM();
        asms.push(a);
    }
    var asm;
    switch (asms.length) { 
        case 1:
            asm = asms[0];
            break;
        case 2:
            asm = 'OP_IF'    + ' ' + asms[0] + ' ' + 'OP_ELSE' + ' ' + asms[1] + ' ' + 'OP_ENDIF';
            break;
        case 3:
            asm = 'OP_IF'    + ' ' + 
                   'OP_IF'   + ' ' + asms[0] + ' ' + 'OP_ELSE' + ' ' + asms[1] + ' ' + 'OP_ENDIF' + ' ' +
                  'OP_ELSE'  + ' ' + 
                   asms[2]   + ' ' + 
                  'OP_ENDIF';
            break;
        case 4:
            asm = 'OP_IF'    + ' ' + 
                   'OP_IF'   + ' ' + asms[0] + ' ' + 'OP_ELSE' + ' ' + asms[1] + ' ' + 'OP_ENDIF' + ' ' +
                  'OP_ELSE'  + ' ' + 
                   'OP_IF'   + ' ' + asms[2] + ' ' + 'OP_ELSE' + ' ' + asms[3] + ' ' + 'OP_ENDIF' + ' ' +
                  'OP_ENDIF';
            break;
    }
    return Script.fromASM(asm);
}

// Build the TX like the normal TXes the TransactionBuilder knows how to build.
// At this point the signatures have got the subscript set in the "redeem script" field.
// Once built we'll need to switch that for the real redeemScript, and add the branch flags.
BranchingTransactionBuilder.prototype.build = function() {

    var tx = this.builder.build();
    for(index in this.inputBranches) {
        if (!this.inputBranches.hasOwnProperty(index)) {
            continue;
        }

        var chunks = tx.ins[index].script.chunks;

        // Remove the fake (subscript) redeem script
        chunks.pop();

        var branch = this.inputBranches[index]['selected_branch'];
        var total_branches = this.inputBranches[index]['total_branches'];

        flags = this.IF_TREE_FLAGS[total_branches][branch];
        flags = flags.map( function(v) { return v == 1 ? ops.OP_1 : ops.OP_0 } );

        // go backwards because the script is read off the stack right-to-left
        for (var f=flags.length-1; f>=0; f--) {
            chunks.push(flags[f]);
        }

        // Add the real redeem script
        chunks.push(this.inputRedeemScripts[index].toBuffer());

        tx.ins[index].script = Script.fromChunks(chunks);

    }
    return tx;
}

// You'll have to specify which branch you want to spend manually.
// In most cases we could probably automate this.
// However, the edge cases can get a bit hairy.
// For example, your sig may work for multiple branches
// But you may not know which one the next person to get the tx wants to sign...
BranchingTransactionBuilder.prototype.selectInputBranch = function(index, branch, num_branches) {
    assert(num_branches > 0);
    assert(num_branches < 5);
    assert(index < num_branches);
    this.inputBranches[index] = {
        'selected_branch': branch,
        'total_branches': num_branches
    };
}

module.exports = BranchingTransactionBuilder
