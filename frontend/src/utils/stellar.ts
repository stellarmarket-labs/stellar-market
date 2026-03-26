import { xdr, scValToNative } from "@stellar/stellar-sdk";

export function parseJobIdFromResult(txResult: {
  resultXdr?: string;
  resultMetaXdr?: string;
}): number {
  if (!txResult.resultXdr) {
    throw new Error("No transaction result XDR found");
  }

  try {
    // 1. Parse the TransactionResult XDR
    const txResultXdr = xdr.TransactionResult.fromXDR(txResult.resultXdr, "base64");
    
    // 2. Extract the result of the first operation (InvokeHostFunction)
    // For Soroban, the result is in the result array of the operation result
    const opResults = txResultXdr.result().results();
    if (opResults.length === 0) {
      throw new Error("No operation results found in transaction");
    }

    const firstOpResult = opResults[0];
    const tr = firstOpResult.tr();
    
    // Check if it's an InvokeHostFunction result
    if (tr.arm() !== "invokeHostFunctionResult") {
        throw new Error(`Unexpected operation result type: ${tr.arm()}`);
    }

    const invokeHostFunctionResult = tr.invokeHostFunctionResult();
    
    if (invokeHostFunctionResult.arm() !== "success") {
        throw new Error("InvokeHostFunction operation failed");
    }

    // 3. Convert ScVal to native number (u64)
    const scVal = invokeHostFunctionResult.success();
    const nativeValue = scValToNative(scVal);
    
    if (typeof nativeValue !== "bigint" && typeof nativeValue !== "number") {
        throw new Error(`Unexpected return value type: ${typeof nativeValue}`);
    }

    return Number(nativeValue);
  } catch (err) {
    console.error("Failed to parse job ID from resultXdr:", err);
    
    // Fallback: Try to parse from events if resultXdr parsing fails
    // (Optional, but good for robustness)
    if (txResult.resultMetaXdr) {
        try {
            const txMeta = xdr.TransactionMeta.fromXDR(txResult.resultMetaXdr, "base64");
            const v3 = txMeta.v3();
            const events = v3.sorobanMeta()?.events() || [];
            
            for (const event of events) {
                const topics = event.type() === xdr.ContractEventType.Contract ? event.body().v0().topics() : [];
                if (topics.length >= 2) {
                    const topic1 = scValToNative(topics[0]);
                    const topic2 = scValToNative(topics[1]);
                    
                    if (topic1 === "escrow" && topic2 === "created") {
                        const data = scValToNative(event.body().v0().data());
                        // Event data is (job_count, client, freelancer)
                        if (Array.isArray(data) && data.length > 0) {
                            return Number(data[0]);
                        }
                    }
                }
            }
        } catch (eventErr) {
            console.error("Failed to parse job ID from events:", eventErr);
        }
    }

    throw new Error("Failed to parse on-chain job ID from transaction result");
  }
}
