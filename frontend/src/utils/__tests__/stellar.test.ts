import { xdr } from "@stellar/stellar-sdk";
import { parseJobIdFromResult } from "../stellar";

describe("parseJobIdFromResult", () => {
    function createMockResultXdr(jobId: number) {
        const scVal = xdr.ScVal.scvU64(xdr.Uint64.fromString(jobId.toString()));
        const result = xdr.InvokeHostFunctionResult.success(scVal);
        const tr = xdr.OperationResultTr.invokeHostFunctionResult(result);
        const opResult = xdr.OperationResult.opInner(tr);
        const txResult = new xdr.TransactionResult({
            feeCharged: xdr.Int64.fromString("100"),
            result: xdr.TransactionResultResult.txSuccess([opResult]),
            ext: xdr.TransactionResultExt.v0()
        });
        return txResult.toXDR("base64");
    }

    it("should parse a valid job ID from resultXdr", () => {
        const mockJobId = 42;
        const resultXdr = createMockResultXdr(mockJobId);
        const txResult = { resultXdr };

        const parsedId = parseJobIdFromResult(txResult);
        expect(parsedId).toBe(mockJobId);
    });

    it("should throw error if resultXdr is missing", () => {
        expect(() => parseJobIdFromResult({})).toThrow("No transaction result XDR found");
    });

    it("should throw error if transaction failed", () => {
        const txResult = {
            resultXdr: new xdr.TransactionResult({
                feeCharged: xdr.Int64.fromString("100"),
                result: xdr.TransactionResultResult.txFailed(),
                ext: xdr.TransactionResultExt.v0()
            }).toXDR("base64")
        };
        expect(() => parseJobIdFromResult(txResult)).toThrow();
    });
});
