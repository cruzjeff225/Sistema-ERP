import {ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsInt, Min} from 'class-validator';

export class PurgeTrashDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ArrayUnique() @IsInt({each:true}) @Min(1,{each:true})
  ids: number[];
  @Equals(true,{message:'Confirme la eliminación definitiva'})
  confirmed: boolean;
}
