function(context, args)
{
	
	// TO DO:
	// 
	// 1) split the search into pages
	// 2) add a default search in the {mode:"read"} page
	// 3) add info mode
	// 4) make front page look friendlier
	// 5) add an easter egg banana mode for dtr
	// 
	
	var l = #fs.scripts.lib();
	
	function Post( postObj ) { // bulletin board post object
		var o = JSON.parse( JSON.stringify( postObj ) );
		
		o.print = (function( self , nest_level ) {
			let out = "" , nestStr = new Array(nest_level + 1).join( "`b|`" ) , childPosts , thisChild;
			
			if( self.title ) out += "\n    `L" + self.title + "`";
			
			out += "\n" + nestStr + "\n" + nestStr + "Posted by @" + self.author;
			
			out += "\n" + nestStr + "With post id: " + self.id;
			
			out += "\n" + nestStr + "At " + l.to_game_timestr( new Date( self.created ) ) + "\n" + nestStr;
			
			
			for( let i = 0; i < self.content.length; i += Math.max( context.cols - nest_level , 1 ) ) {
				out += "\n" + nestStr + self.content.substring( i , i + context.cols - nest_level );
			}
			
			out += "\n" + nestStr;
			
			childPosts = #db.f( { type : "bbs_post" , parentId : self.id } , { _id : 0 } ).array().map( x => new Post( x ) );
			
			
			for( let i = 0; i < childPosts.length; i++ ) {
				out += childPosts[ i ].print( nest_level + 1 )
			}
			
			return out
		}).bind( o , o );
		
		return o
	}
	
	function getNewId() {
		var id = parseInt( #db.ObjectId().$oid.slice( - 13 ) , 16 );
		
		while( #db.f( { type : "bbs_post" , id : id } , { id : 1 } ).first() ) {
			id ++;
		}
		
		return id
	}
	
	args = Object.assign( {} , ( typeof args == "object" ) ? args : {} );
	
	if( !context.calling_script || context.calling_script.split(".")[0] != context.this_script.split(".")[0] ) {
		let tempArgs = JSON.stringify( args );
		
		#db.us( {
			type : "script_counter" ,
			script : context.this_script ,
			caller: context.caller
		} , {
			$inc : {
				runs : 1
			} ,
			$push : {
				calls : [ Date.now() , context , tempArgs ]
			}
		} )
	}
	
	switch( args.mode ) {
		case( "read" ) :
			
			if( args.read || args.read === 0 ) { // read a specific entry
				let dbPost = #db.f( { type : "bbs_post" , id : args.read } , { _id : 0 } ).first();
				
				if( !dbPost ) {
					return { ok : false , msg : "I couldn't find a post with that id." }
				}
				
				dbPost = new Post( dbPost );
				
				return dbPost.print(0)
				
			} else { // search
				if( !( args.search instanceof Object ) ) {
					return { ok : false , msg : "To search for posts, please provide a `Nsearch` object to find matching posts.\nYou might want to search for `Nid`, `Nauthor`, date / time `Ncreated`, `Ntitle`, or `Ncontent`.\nParameters also accept mongodb query conditionals,\n    e.g. search : { content : { \"$regex\" : \"hackmud\" } } .\nOnce you find the post you want to read, read it with `Nread`:`V<id>`" }
				}
				
				let searchString = "" , postSearchResults = #db.f( Object.assign( {} , args.search , { type : "bbs_post" , title : { $ne : null } } ) ).array().reverse();
				// { id : 1 , author : 1 , title : 1 , created : 1 }
				for( let i = 0; i < postSearchResults.length; i++ ) {
					searchString += "\nid : " + postSearchResults[ i ].id + " | title : \"" + postSearchResults[ i ].title + "\" | author : @" + postSearchResults[ i ].author + " | created : " + postSearchResults[ i ].created;
				}
				
				return { ok : true , msg : searchString }
				
			}
			
			break;
		
		case( "write" ) :
			if( #FMCL ) return { ok : false , msg : "You may not write more than once per script run." }
			
			let tooFast = false , pastWrites = #db.f( { caller : context.caller , script : context.this_script , type : "spam_protector" } , { last : 1 } ).first() , outgoingPost = {};
			if( typeof pastWrites.last == "number" ) {
				tooFast = !( ( Date.now() - pastWrites.last ) > 10000 );
			}
			if( tooFast ) return { ok : false , msg : "You are writing messages too fast. Please wait a moment before trying again." }
			
			if( typeof args.write == "object" && ( typeof args.write.comment == "number" ^ typeof args.write.title == "string" ) && typeof args.write.content == "string" ) {
				args.write.comment = ( typeof args.write.comment == "number" ) ? args.write.comment : null;
				args.write.title = ( typeof args.write.title == "string" ) ? args.write.title : null;
				
				if( (typeof args.write.comment == "number") && ! #db.f( { type : "bbs_post" , id : args.write.comment } ).first()  ) return { ok : false , msg : "The post or comment you were trying to comment on could not be found. Please ensure you entered the correct `Ncomment`:`V<id>`." }
				if( (typeof args.write.title == "string") && ( args.write.title.length > 200 || args.write.title.split( "" ).includes( "\n" ) ) ) return { ok : false , msg : "Your `Ntitle` must not exceed 200 characters and it must not contain any newline characters." }
				if( args.write.content.length > 2000 || args.write.content.split( "\n" ).length > 75 ) return { ok : false , msg : "Your `Ncontent` must not exceed 2000 characters or 75 lines." }
				
				outgoingPost = { type : "bbs_post" , id : getNewId() , parentId : args.write.comment , author : context.caller , title : args.write.title , created : Date.now() , content : args.write.content };
				#db.i( outgoingPost );
			} else if( typeof args.write == "object" && ( !!args.write.comment ^ !!args.write.title ) ) {
				return { ok : false , msg : "Please only pass either the `Ncomment`:`V<id>` of the post you want to comment on or the `Ntitle` you want to give your post." }
			} else {
				return { ok : false , msg : "To write a post, provide an object `Nwrite` with the properties `Ncontent` (as a string), and either a `Ntitle` (as a string) or the id of the post you want to `Ncomment` on (as a number). " }
			}
			
			outgoingPost = new Post( outgoingPost );
			
			#db.us( {
				type : "spam_protector" ,
				script : context.this_script ,
				caller: context.caller
			} , {
				$set : {
					last : Date.now()
				}
			} )		
			
			return { ok : true , msg : outgoingPost.print( 0 ) }
			break;
		
		default:
			if( args.mode ) return { ok : false , msg : "Congratulations! You found the secret mode:" + JSON.stringify( args.mode ) + " !\n\n... not really. I don't know what that mode is.\nPlease give me `Nmode` : `V\"read\"` or `V\"write\"` to proceed." }
			break;
	}
	
	// what does a post look like?
	// elements: String type, Number id, Number parentId ( or null if root post ), String author, String title ( null if comment ), Number created, String content
	// { type , id , parentId , author , title , created , content }
	
	return { ok : false , msg : "Please give me a `Nmode` : `V\"read\"` or `V\"write\"` to proceed." };
}
